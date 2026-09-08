/**
 * "market-monitor" core logic (server-only).
 *
 * Napi magyar ipari ingatlanpiaci figyelés EGY szervezetre:
 * web keresés -> URL alapú deduplikálás az elmúlt 14 nap forrásaihoz képest
 * -> EGYETLEN, összefüggő magyar napi összegzés -> egy darab market_reports
 * sor (report_type = 'napi_osszefoglalo', naponta pontosan egy).
 *
 * Ha ugyanazon a napon többször fut (pl. kézi "Frissítés most"), a napi sort
 * FRISSÍTI, nem hoz létre újat — így a naptárban minden nap egy összegzés
 * marad.
 *
 * COST NOTE: naponta kb. 1 web-kereséses + 1 sima AI-hívás szervezetenként.
 */

import {
  generateText,
  generateTextWithWebSearch,
  isAiOutOfCreditError,
  resolveAiProvider,
} from "@/server/ai-provider.server";

/** Easily editable search query list. */
export const QUERIES = (year: number) => [
  `ipari ingatlan piac Magyarország hírek ${year}`,
  "ipari park logisztikai csarnok fejlesztés Magyarország",
  "CBRE Magyarország ipari logisztikai piaci jelentés",
  "JLL Magyarország ipari ingatlan piaci elemzés",
  "Cushman & Wakefield Magyarország ipari ingatlan piac",
  "KSH ipari ingatlan statisztika",
];

/** Ennyi nap forrásait vesszük figyelembe a duplikátumszűrésnél. */
const DEDUPE_WINDOW_DAYS = 14;

const SEARCH_SYSTEM_PROMPT = [
  "Magyar ipari ingatlanpiaci hírfigyelő asszisztens vagy.",
  "Web keresés segítségével keresd meg a legfrissebb (kb. az elmúlt 24-48",
  "órában megjelent) magyar ipari/logisztikai ingatlanpiaci híreket,",
  "jelentéseket, szabályozási változásokat és fejlesztési bejelentéseket.",
  'Válaszod KIZÁRÓLAG JSON tömb legyen: [{"title":"...","source_name":"kiadó neve","source_url":"https://...","takeaway":"egy soros magyar tanulság"}].',
  "Csak valóban létező, a keresésben megtalált URL-eket adj vissza — soha ne",
  "találj ki forrást vagy adatot. Legfeljebb 10 tételt adj vissza.",
  "Ha nincs friss hír, adj vissza üres tömböt.",
].join(" ");

/**
 * A napi összegzés megfogalmazása. Szándékosan részletes nyelvi elvárás:
 * a korábbi, gépi fordítás-szagú, nyelvtanilag hibás magyar szöveg miatt.
 */
const DAILY_SUMMARY_SYSTEM_PROMPT = [
  "Magyar ipari ingatlanpiaci elemző vagy, aki anyanyelvi szinten,",
  "kifogástalan magyar nyelvtannal ír.",
  "A megadott hírtételekből írj EGYETLEN, összefüggő napi összegzést",
  "(kb. 150-300 szó) egy ipari ingatlanos bróker csapat számára.",
  "",
  "NYELVI ELVÁRÁSOK (kötelező):",
  "- Helyes magyar nyelvtan, egyeztetés, szórend és toldalékolás.",
  "- NE fordíts szó szerint angolból; magyar szakmai terminológiát használj",
  "  (pl. 'bérbeadás', 'üresedési arány', 'bérleti díj', 'raktárkapacitás').",
  "- Teljes, gördülékeny mondatok; kerüld a tőmondatos felsorolásszerű,",
  "  darabos szöveget és az angol kifejezéseket (pl. 'take-up', 'prime yield')",
  "  magyar megfelelő nélkül.",
  "- Tárgyilagos, tényközlő hangnem, marketingszöveg nélkül.",
  "",
  "TARTALMI ELVÁRÁSOK:",
  "- Egy rövid, összefoglaló nyitó bekezdés: mi a nap legfontosabb üzenete.",
  "- Utána 1-2 bekezdésben a részletek, tematikus sorrendben.",
  "- Számot vagy adatot CSAK akkor írj, ha a megadott tételekben explicit",
  "  szerepel; soha ne becsülj és ne találj ki adatot.",
  "- Ahol van forrás URL, tedd ki markdown linkként: [forrás](URL).",
  "- Ha a megadott tételek listája üres, írj egyetlen tárgyilagos mondatot",
  "  arról, hogy aznap nem jelent meg érdemi, nyilvános piaci hír.",
  "",
  "FORMÁTUM: markdown, cím nélkül (a címet a rendszer adja). Alcímeket ne",
  "használj, ez egy rövid napi összegzés, nem tagolt riport.",
].join("\n");

export interface MarketMonitorOrgResult {
  organizationId: string;
  status: "ok" | "no_provider" | "out_of_credit" | "error";
  newItems: number;
  message?: string;
}

interface FoundItem {
  title?: string;
  source_name?: string;
  source_url?: string;
  takeaway?: string;
}

interface StoredSource {
  title: string;
  source_name: string;
  source_url: string;
}

type SettingsRow = {
  organization_id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  preferred_ai_provider: string | null;
};

function parseJsonArray(text: string): FoundItem[] {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as FoundItem[]) : [];
  } catch {
    return [];
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function runMarketMonitorForOrg(
  settings: SettingsRow,
  now: Date = new Date(),
): Promise<MarketMonitorOrgResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const organizationId = settings.organization_id;

  const resolved = resolveAiProvider(settings);
  if (!resolved) {
    console.log(`[market-monitor] Skipping organization ${organizationId}: no AI provider key.`);
    return { organizationId, status: "no_provider", newItems: 0 };
  }

  const year = now.getUTCFullYear();
  const today = toIsoDate(now);
  const dedupeFrom = new Date(now);
  dedupeFrom.setUTCDate(now.getUTCDate() - DEDUPE_WINDOW_DAYS);

  // Az elmúlt napok összegzéseiben már feldolgozott forrás-URL-ek.
  const { data: recentRows } = await supabaseAdmin
    .from("market_reports")
    .select("key_data")
    .eq("organization_id", organizationId)
    .eq("report_type", "napi_osszefoglalo")
    .gte("report_date", toIsoDate(dedupeFrom));

  const knownUrls = new Set<string>();
  for (const row of recentRows ?? []) {
    const sources = (row.key_data as { sources?: StoredSource[] } | null)?.sources ?? [];
    for (const source of sources) {
      if (source?.source_url) knownUrls.add(source.source_url);
    }
  }

  let found: FoundItem[] = [];
  try {
    const result = await generateTextWithWebSearch({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      systemPrompt: SEARCH_SYSTEM_PROMPT,
      userPrompt: [
        "Keresd meg a legfrissebb magyar ipari ingatlanpiaci híreket az alábbi keresésekkel:",
        ...QUERIES(year).map((q) => `- ${q}`),
        "",
        "Csak az elmúlt 24-48 órában megjelent, valóban új tételeket sorolj fel.",
      ].join("\n"),
      organizationId,
      maxTokens: 2500,
    });
    found = parseJsonArray(result.text);
  } catch (err) {
    if (isAiOutOfCreditError(err)) {
      console.log(`[market-monitor] Organization ${organizationId}: AI credit exhausted, skipping.`);
      return { organizationId, status: "out_of_credit", newItems: 0 };
    }
    console.error(`[market-monitor] Organization ${organizationId} search failed:`, err);
    return {
      organizationId,
      status: "error",
      newItems: 0,
      message: err instanceof Error ? err.message : "unknown error",
    };
  }

  const fresh: StoredSource[] = [];
  const freshItems: FoundItem[] = [];
  for (const item of found) {
    if (!item.source_url || !item.title) continue;
    if (knownUrls.has(item.source_url)) continue;
    knownUrls.add(item.source_url);
    freshItems.push(item);
    fresh.push({
      title: item.title,
      source_name: item.source_name ?? "Ismeretlen forrás",
      source_url: item.source_url,
    });
  }

  // Egyetlen, összefüggő napi összegzés — akkor is készül, ha nincs új hír,
  // hogy a naptárban minden napra pontosan egy bejegyzés tartozzon.
  let summary: string;
  try {
    const result = await generateText({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      systemPrompt: DAILY_SUMMARY_SYSTEM_PROMPT,
      userPrompt: `Nap: ${today}\nHírtételek (JSON):\n${JSON.stringify(freshItems)}`,
      organizationId,
      maxTokens: 1200,
    });
    summary = result.text.trim();
  } catch (err) {
    if (isAiOutOfCreditError(err)) {
      return { organizationId, status: "out_of_credit", newItems: 0 };
    }
    console.error(`[market-monitor] Daily summary failed for ${organizationId}:`, err);
    return {
      organizationId,
      status: "error",
      newItems: fresh.length,
      message: err instanceof Error ? err.message : "unknown error",
    };
  }

  if (!summary) {
    summary =
      fresh.length > 0
        ? fresh.map((s) => `- **${s.title}** ([forrás](${s.source_url}))`).join("\n")
        : "Ezen a napon nem jelent meg érdemi, nyilvánosan elérhető piaci hír.";
  }

  const title = `Napi piaci összegzés — ${today}`;

  // Naponta pontosan egy sor: ha ma már van, frissítjük.
  const { data: existing } = await supabaseAdmin
    .from("market_reports")
    .select("id, key_data")
    .eq("organization_id", organizationId)
    .eq("report_type", "napi_osszefoglalo")
    .eq("report_date", today)
    .maybeSingle();

  if (existing) {
    const previous = (existing.key_data as { sources?: StoredSource[] } | null)?.sources ?? [];
    const merged = [...previous];
    for (const source of fresh) {
      if (!merged.some((item) => item.source_url === source.source_url)) merged.push(source);
    }
    const { error } = await supabaseAdmin
      .from("market_reports")
      .update({
        title,
        summary,
        source_name: "AI napi összegzés",
        key_data: { sources: merged },
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[market-monitor] Update failed:", error.message);
      return { organizationId, status: "error", newItems: fresh.length, message: error.message };
    }
  } else {
    const { error } = await supabaseAdmin.from("market_reports").insert({
      organization_id: organizationId,
      report_date: today,
      period_start: today,
      period_end: today,
      report_type: "napi_osszefoglalo",
      source_name: "AI napi összegzés",
      title,
      summary,
      source_url: null,
      year,
      key_data: { sources: fresh },
    });
    if (error) {
      console.error("[market-monitor] Insert failed:", error.message);
      return { organizationId, status: "error", newItems: fresh.length, message: error.message };
    }
  }

  return { organizationId, status: "ok", newItems: fresh.length };
}

export async function runMarketMonitorForAllOrgs(): Promise<MarketMonitorOrgResult[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: orgs, error } = await supabaseAdmin
    .from("settings")
    .select("organization_id, openai_api_key, anthropic_api_key, preferred_ai_provider");
  if (error) throw error;

  const results: MarketMonitorOrgResult[] = [];
  for (const org of orgs ?? []) {
    results.push(await runMarketMonitorForOrg(org as SettingsRow));
  }
  return results;
}
