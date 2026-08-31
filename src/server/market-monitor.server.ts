/**
 * "market-monitor" core logic (server-only).
 *
 * Runs the daily Hungarian industrial real estate market scan for one
 * organization: web search -> dedupe by source_url -> AI summary ->
 * market_reports rows -> today's daily_digests entry.
 *
 * COST NOTE: this triggers the provider's web search tool roughly 5-10 times
 * per organization per day. Keep that in mind when checking the AI bill, and
 * lower QUERIES or the cron frequency if costs run higher than expected.
 */

import {
  generateText,
  generateTextWithWebSearch,
  isAiOutOfCreditError,
  resolveAiProvider,
} from "@/server/ai-provider.server";

/** Easily editable search query list. */
export const QUERIES = (year: number) => [
  `ipari ingatlan piac Magyarország riport ${year}`,
  "CBRE Magyarország ipari logisztikai piaci jelentés",
  "JLL Magyarország ipari ingatlan piaci elemzés",
  "Cushman & Wakefield Magyarország ipari ingatlan piac",
  "KSH ipari ingatlan statisztika",
];

const SEARCH_SYSTEM_PROMPT =
  "Magyar ipari ingatlanpiaci hírfigyelő asszisztens vagy. Web keresés segítségével keresd meg a legfrissebb (kb. az elmúlt 24-48 órában megjelent) magyar ipari/logisztikai ingatlanpiaci híreket, jelentéseket. Válaszod KIZÁRÓLAG JSON tömb legyen: [{\"title\":\"...\",\"source_name\":\"kiadó neve\",\"source_url\":\"https://...\",\"takeaway\":\"egy soros magyar tanulság\"}]. Csak valóban létező, a keresésben megtalált URL-eket adj vissza. Ha nincs friss hír, adj vissza üres tömböt.";

const SUMMARY_SYSTEM_PROMPT =
  "Magyar ipari ingatlanpiaci elemző vagy. Írj 2-4 mondatos, tárgyilagos magyar összefoglalót a megadott hírről. Számot csak akkor írj, ha az explicit szerepel a megadott szövegben — soha ne becsülj vagy találj ki adatot. Csak az összefoglalót add vissza.";

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

type SettingsRow = {
  organization_id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  preferred_ai_provider: string | null;
};

export async function runMarketMonitorForOrg(
  settings: SettingsRow,
): Promise<MarketMonitorOrgResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const organizationId = settings.organization_id;

  const resolved = resolveAiProvider(settings);
  if (!resolved) {
    console.log(`[market-monitor] Skipping organization ${organizationId}: no AI provider key.`);
    return { organizationId, status: "no_provider", newItems: 0 };
  }

  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

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

  const withUrl = found.filter((item) => item.source_url && item.title);

  // Dedupe by market_reports.source_url
  const urls = withUrl.map((item) => item.source_url as string);
  const knownUrls = new Set<string>();
  if (urls.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("market_reports")
      .select("source_url")
      .eq("organization_id", organizationId)
      .in("source_url", urls);
    for (const row of existing ?? []) {
      if (row.source_url) knownUrls.add(row.source_url);
    }
  }

  const fresh = withUrl.filter((item) => !knownUrls.has(item.source_url as string));
  const inserted: FoundItem[] = [];

  for (const item of fresh) {
    let summary = item.takeaway ?? "";
    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        userPrompt: `Cím: ${item.title}\nKiadó: ${item.source_name ?? "—"}\nLink: ${item.source_url}\nRövid tanulság: ${item.takeaway ?? "—"}`,
        organizationId,
        maxTokens: 500,
      });
      if (result.text) summary = result.text;
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { organizationId, status: "out_of_credit", newItems: inserted.length };
      }
      console.error("[market-monitor] Summary failed:", err);
    }

    const { error } = await supabaseAdmin.from("market_reports").insert({
      organization_id: organizationId,
      report_date: today,
      source_name: item.source_name ?? "Ismeretlen forrás",
      title: item.title as string,
      summary,
      source_url: item.source_url as string,
      year,
      key_data: {},
    });
    if (error) {
      console.error("[market-monitor] Insert failed:", error.message);
      continue;
    }
    inserted.push({ ...item, takeaway: summary });
  }

  // Today's digest entry — always written so the history stays consistent.
  const section =
    inserted.length > 0
      ? [
          "## Piaci hírek",
          ...inserted.map(
            (item) =>
              `- **${item.title}** — ${(item.takeaway ?? "").split("\n")[0]} ([forrás](${item.source_url}))`,
          ),
        ].join("\n")
      : "## Piaci hírek\n\nNincs új piaci hír ma.";

  const { data: digest } = await supabaseAdmin
    .from("daily_digests")
    .select("id, content_markdown")
    .eq("organization_id", organizationId)
    .eq("date", today)
    .maybeSingle();

  if (digest) {
    const existingContent = digest.content_markdown ?? "";
    const withoutOldSection = existingContent.split("## Piaci hírek")[0]?.trimEnd() ?? "";
    await supabaseAdmin
      .from("daily_digests")
      .update({ content_markdown: `${withoutOldSection}\n\n${section}`.trim() })
      .eq("id", digest.id);
  } else {
    await supabaseAdmin.from("daily_digests").insert({
      organization_id: organizationId,
      date: today,
      content_markdown: section,
    });
  }

  return { organizationId, status: "ok", newItems: inserted.length };
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
