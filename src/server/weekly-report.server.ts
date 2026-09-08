/**
 * "weekly-report" core logic (server-only).
 *
 * Runs a weekly Hungarian industrial real estate market + partner-movement
 * report for one organization: two rounds of web search (general market /
 * government / regulation / development news, then a per-partner check for
 * companies already promoted to the CRM) -> one synthesized ~2 A4 page
 * Hungarian markdown report -> a single market_reports row
 * (report_type = 'heti_osszefoglalo').
 *
 * Intended to run every Monday, summarizing the previous Monday-Sunday week.
 *
 * COST NOTE: this makes 1 general web-search call, up to PARTNER_CHECK_CAP
 * per-partner web-search calls, and 1 non-search synthesis call per
 * organization per week. Keep this in mind when checking the AI bill —
 * lower PARTNER_CHECK_CAP if costs run higher than expected.
 */

import {
  generateText,
  generateTextWithWebSearch,
  isAiOutOfCreditError,
  resolveAiProvider,
} from "@/server/ai-provider.server";

/** Easily editable general-search query list. */
const WEEKLY_QUERIES = (year: number) => [
  `ipari ingatlan piac Magyarország hírek ${year}`,
  "ipari ingatlan Magyarország kormányzati szabályozás",
  "ipari park fejlesztés Magyarország bejelentés",
  "logisztikai csarnok bérlet Magyarország aláírás",
  "CBRE Magyarország ipari ingatlan piaci jelentés",
  "JLL Magyarország ipari ingatlan piaci elemzés",
  "Cushman & Wakefield Magyarország ipari ingatlan",
  "KSH ipari termelés statisztika",
  "HIPA befektetés ipari csarnok Magyarország",
];

/**
 * Legfeljebb ennyi, már CRM-be emelt ("valódi") partnert ellenőrzünk
 * hetente, egyenként külön web-kereséssel — ez a fő költségtényező, ezért
 * van felső korlátja. Ha többre van szükség, itt emeld meg.
 */
const PARTNER_CHECK_CAP = 15;

const SEARCH_SYSTEM_PROMPT = [
  "Magyar ipari ingatlanpiaci hírfigyelő asszisztens vagy.",
  "Web keresés segítségével keresd meg az ELMÚLT 7 NAPBAN megjelent, magyar",
  "ipari/logisztikai ingatlanpiachoz kapcsolódó nyilvános információkat:",
  "piaci híreket és jelentéseket, állami/kormányzati információkat és",
  "szabályozási változásokat, új fejlesztéseket (pl. új csarnok, park,",
  "beruházás bejelentése), érdekes szakmai cikkeket, és nyilvánosan",
  "bejelentett aláírásokat/megállapodásokat (pl. bérleti szerződés,",
  "befektetés).",
  'Válaszod KIZÁRÓLAG JSON tömb legyen: [{"category":"piac|szabalyozas|fejlesztes|cikk|alairas","title":"...","source_name":"...","source_url":"https://...","takeaway":"1-2 mondatos magyar összefoglaló"}].',
  "Csak valóban létező, a keresésben megtalált URL-eket adj vissza — soha ne",
  "találj ki forrást vagy adatot. Legfeljebb 15 tételt adj vissza, a",
  "legrelevánsabbakat. Ha nincs találat, adj vissza üres tömböt.",
].join(" ");

const PARTNER_SYSTEM_PROMPT = [
  "Magyar üzleti hírfigyelő asszisztens vagy. Web keresés segítségével",
  "ellenőrizd, van-e nyilvánosan elérhető, hiteles forrásból származó hír",
  "VAGY esemény az ELMÚLT 7 NAPBÓL a megadott magyarországi céggel",
  "kapcsolatban (pl. új szerződés, bővítés, beruházás, vezetőváltás, egyéb",
  "üzleti mozgás).",
  'Válaszod KIZÁRÓLAG JSON objektum legyen: {"found":true|false,"summary":"1-2 mondatos magyar összefoglaló, csak ha found=true, egyébként null","source_url":"https://... vagy null"}.',
  "Ha nincs releváns, friss, hiteles találat, adj vissza",
  '{"found":false,"summary":null,"source_url":null} — soha ne találj ki adatot.',
].join(" ");

const SYNTHESIS_SYSTEM_PROMPT = [
  "Magyar ipari ingatlanpiaci elemző vagy, aki anyanyelvi szinten,",
  "kifogástalan magyar nyelvtannal ír. A megadott, már összegyűjtött",
  "tényanyagból (JSON) írj egy kb. 2 A4 oldal terjedelmű (kb. 700-900 szavas)",
  "magyar nyelvű heti riportot egy ipari ingatlanos bróker csapat számára.",
  "",
  "NYELVI ELVÁRÁSOK (kötelező):",
  "- Helyes magyar nyelvtan, egyeztetés, szórend és toldalékolás.",
  "- NE fordíts szó szerint angolból; magyar szakmai terminológiát használj",
  "  (pl. 'bérbeadás', 'üresedési arány', 'bérleti díj', 'raktárkapacitás',",
  "  'hozamszint'). Angol kifejezést csak akkor hagyj benne, ha nincs bevett",
  "  magyar megfelelője, és akkor is magyarázd meg zárójelben.",
  "- Teljes, gördülékeny mondatok, bekezdésekbe szervezve; kerüld a darabos,",
  "  tőmondatos, gépi fordítás hatását keltő szöveget.",
  "- Tárgyilagos, tényközlő hangnem, marketingszöveg és felsőfok nélkül.",
  "",
  "TARTALMI ELVÁRÁSOK:",
  "- NE keress új információt, NE találj ki semmit — kizárólag a megadott",
  "  tényeket dolgozd fel.",
  "- Számot vagy adatot csak akkor írj, ha a tényanyagban explicit szerepel.",
  "- Ahol van forrás URL, tedd ki markdown linkként: [forrás](URL).",
  "- Ha a bemeneti tényanyag üres vagy nagyon kevés, írj erről egy rövid,",
  "  őszinte megjegyzést ahelyett, hogy kitalálnál tartalmat.",
  "",
  "FORMÁTUM: markdown, '## ' alcímekkel. Az alábbi szekciókból CSAK azokat",
  "használd, amikhez ténylegesen van tartalom: 'Piaci áttekintés',",
  "'Szabályozás és állami hírek', 'Fejlesztések', 'Partnerek mozgása',",
  "'Egyéb érdekességek'.",
].join("\n");

export interface WeeklyReportOrgResult {
  organizationId: string;
  status: "ok" | "no_provider" | "out_of_credit" | "error";
  itemsFound: number;
  partnersChecked: number;
  partnerMovementsFound: number;
  message?: string;
}

interface FoundItem {
  category?: string;
  title?: string;
  source_name?: string;
  source_url?: string;
  takeaway?: string;
}

interface PartnerFinding {
  companyName: string;
  domain: string | null;
  summary: string;
  sourceUrl: string | null;
}

interface PartnerRow {
  company_name: string;
  domain: string | null;
  city: string | null;
}

type SettingsRow = {
  organization_id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  preferred_ai_provider: string | null;
};

function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const arrStart = cleaned.indexOf("[");
  const objStart = cleaned.indexOf("{");
  const useArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = useArray ? arrStart : objStart;
  const end = useArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Legutóbbi teljes hétfő-vasárnap intervallum a megadott dátumhoz képest. */
function getPreviousWeekRange(reference: Date): { start: Date; end: Date } {
  const day = reference.getUTCDay(); // 0 = vasárnap .. 6 = szombat
  const daysSinceSunday = day === 0 ? 7 : day;
  const end = new Date(reference);
  end.setUTCDate(reference.getUTCDate() - daysSinceSunday);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  return { start, end };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Egyszerű, nem AI-generált tartalék, ha az összegző hívás meghiúsul. */
function buildFallbackMarkdown(items: FoundItem[], partners: PartnerFinding[]): string {
  const parts: string[] = [];
  if (items.length > 0) {
    parts.push(
      "## Piaci áttekintés",
      ...items.map(
        (item) =>
          `- **${item.title ?? "—"}** — ${item.takeaway ?? ""}${
            item.source_url ? ` ([forrás](${item.source_url}))` : ""
          }`,
      ),
    );
  }
  if (partners.length > 0) {
    parts.push(
      "",
      "## Partnerek mozgása",
      ...partners.map(
        (p) =>
          `- **${p.companyName}** — ${p.summary}${
            p.sourceUrl ? ` ([forrás](${p.sourceUrl}))` : ""
          }`,
      ),
    );
  }
  if (parts.length === 0) {
    parts.push(
      "## Piaci áttekintés",
      "Ezen a héten nem található nyilvánosan elérhető, releváns esemény vagy hír.",
    );
  }
  return parts.join("\n");
}

export async function runWeeklyReportForOrg(
  settings: SettingsRow,
  now: Date = new Date(),
): Promise<WeeklyReportOrgResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const organizationId = settings.organization_id;

  const resolved = resolveAiProvider(settings);
  if (!resolved) {
    console.log(`[weekly-report] Skipping organization ${organizationId}: no AI provider key.`);
    return { organizationId, status: "no_provider", itemsFound: 0, partnersChecked: 0, partnerMovementsFound: 0 };
  }

  const year = now.getUTCFullYear();
  const { start, end } = getPreviousWeekRange(now);
  const periodStart = toIsoDate(start);
  const periodEnd = toIsoDate(end);

  // --- 1. kör: általános piaci/állami/szabályozási/fejlesztési hírek ---
  let items: FoundItem[] = [];
  try {
    const result = await generateTextWithWebSearch({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      systemPrompt: SEARCH_SYSTEM_PROMPT,
      userPrompt: [
        `Keresd meg a(z) ${periodStart} és ${periodEnd} közötti (elmúlt 7 nap) legfontosabb`,
        "magyar ipari ingatlanpiaci híreket az alábbi keresésekkel:",
        ...WEEKLY_QUERIES(year).map((q) => `- ${q}`),
      ].join("\n"),
      organizationId,
      maxTokens: 3000,
    });
    items = parseJson<FoundItem[]>(result.text) ?? [];
  } catch (err) {
    if (isAiOutOfCreditError(err)) {
      console.log(`[weekly-report] Organization ${organizationId}: AI credit exhausted, skipping.`);
      return { organizationId, status: "out_of_credit", itemsFound: 0, partnersChecked: 0, partnerMovementsFound: 0 };
    }
    console.error(`[weekly-report] Organization ${organizationId} general search failed:`, err);
    return {
      organizationId,
      status: "error",
      itemsFound: 0,
      partnersChecked: 0,
      partnerMovementsFound: 0,
      message: err instanceof Error ? err.message : "unknown error",
    };
  }

  // --- 2. kör: CRM-be emelt ("valódi") partnerek mozgása ---
  const { data: partnerRows } = await supabaseAdmin
    .from("opten_prospects")
    .select("company_name, domain, city")
    .eq("organization_id", organizationId)
    .eq("promoted_to_crm", true)
    .order("created_at", { ascending: false })
    .limit(PARTNER_CHECK_CAP);

  const partners: PartnerFinding[] = [];
  let outOfCreditDuringPartners = false;
  let partnersChecked = 0;

  for (const partner of (partnerRows ?? []) as PartnerRow[]) {
    partnersChecked += 1;
    try {
      const result = await generateTextWithWebSearch({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: PARTNER_SYSTEM_PROMPT,
        userPrompt: `Cég neve: ${partner.company_name}\nWeboldal: ${partner.domain ?? "nem ismert"}\nVárosa: ${partner.city ?? "nem ismert"}`,
        organizationId,
        maxTokens: 1000,
      });
      const parsed = parseJson<{ found?: boolean; summary?: string | null; source_url?: string | null }>(
        result.text,
      );
      if (parsed?.found && parsed.summary) {
        partners.push({
          companyName: partner.company_name,
          domain: partner.domain,
          summary: parsed.summary,
          sourceUrl: parsed.source_url ?? null,
        });
      }
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        console.log(`[weekly-report] Organization ${organizationId}: AI credit exhausted during partner checks.`);
        outOfCreditDuringPartners = true;
        break;
      }
      console.error(`[weekly-report] Partner check failed for ${partner.company_name}:`, err);
    }
  }

  // --- 3. kör: összegzés egy ~2 A4 oldalas riportba ---
  let reportBody: string;
  try {
    const synthesisInput = {
      periodStart,
      periodEnd,
      items,
      partnerMovements: partners.map((p) => ({
        company: p.companyName,
        summary: p.summary,
        sourceUrl: p.sourceUrl,
      })),
    };
    const result = await generateText({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      userPrompt: `Tényanyag (JSON):\n${JSON.stringify(synthesisInput)}`,
      organizationId,
      maxTokens: 3000,
    });
    reportBody = result.text || buildFallbackMarkdown(items, partners);
  } catch (err) {
    if (isAiOutOfCreditError(err)) {
      // Volt már hasznos nyers anyagunk — inkább egy egyszerűbb, nem AI által
      // megfogalmazott riportot mentünk el, mint hogy semmi ne kerüljön be.
      reportBody = buildFallbackMarkdown(items, partners);
    } else {
      console.error(`[weekly-report] Synthesis failed for organization ${organizationId}:`, err);
      reportBody = buildFallbackMarkdown(items, partners);
    }
  }

  const title = `Heti piaci riport (${periodStart} – ${periodEnd})`;
  const { error: insertError } = await supabaseAdmin.from("market_reports").insert({
    organization_id: organizationId,
    report_date: toIsoDate(now),
    period_start: periodStart,
    period_end: periodEnd,
    report_type: "heti_osszefoglalo",
    source_name: "AI heti piaci riport",
    title,
    summary: reportBody,
    source_url: null,
    year,
    key_data: {},
  });
  if (insertError) {
    console.error(`[weekly-report] Insert failed for organization ${organizationId}:`, insertError.message);
    return {
      organizationId,
      status: "error",
      itemsFound: items.length,
      partnersChecked,
      partnerMovementsFound: partners.length,
      message: insertError.message,
    };
  }

  return {
    organizationId,
    status: outOfCreditDuringPartners ? "out_of_credit" : "ok",
    itemsFound: items.length,
    partnersChecked,
    partnerMovementsFound: partners.length,
  };
}

export async function runWeeklyReportForAllOrgs(): Promise<WeeklyReportOrgResult[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: orgs, error } = await supabaseAdmin
    .from("settings")
    .select("organization_id, openai_api_key, anthropic_api_key, preferred_ai_provider");
  if (error) throw error;

  const results: WeeklyReportOrgResult[] = [];
  for (const org of orgs ?? []) {
    results.push(await runWeeklyReportForOrg(org as SettingsRow));
  }
  return results;
}
