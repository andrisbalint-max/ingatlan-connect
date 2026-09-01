import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiCallStatus = "ok" | "no_provider" | "out_of_credit" | "error";

export interface RevenueBand {
  label: string;
  min: number | null;
  max: number | null;
}

/** header name in the uploaded Excel/CSV -> internal prospect field (or "skip") */
export type ExcelColumnMapping = Record<string, string>;

export interface OptenConfig {
  bands: RevenueBand[];
  columnMapping: ExcelColumnMapping | null;
}

export interface CategorizeResult {
  status: AiCallStatus | "nothing_to_do";
  message?: string | undefined;
  categorized?: number | undefined;
}

export interface DomainLookupResult {
  status: AiCallStatus | "nothing_to_do" | "not_found";
  message?: string | undefined;
  domain?: string | undefined;
  sourceUrl?: string | undefined;
}

export interface CategorySuggestionResult {
  status: AiCallStatus | "no_categories";
  message?: string | undefined;
  categories?: string[] | undefined;
}

const CATEGORIZER_SYSTEM_PROMPT =
  'Ipari ingatlan B2B bróker asszisztens vagy. Cégeket kell tevékenységi kategóriákba sorolnod magyarul. Használd újra a MEGADOTT létező kategóriákat, ha a cég valóban beleillik; csak akkor javasolj új, rövid magyar kategórianevet (pl. "Logisztika és raktározás", "Élelmiszeripar", "Gépgyártás"), ha egyik létező sem illik. A cél egy kicsi, stabil, újrahasznosítható kategóriakészlet — soha ne készíts cégenként külön kategóriát. Válaszod KIZÁRÓLAG JSON: {"assignments":[{"company_name":"pontosan a megadott név","activity_category":"kategória"}]}';

const PROJECT_CATEGORY_SYSTEM_PROMPT =
  'Ipari ingatlan B2B bróker asszisztens vagy. A projekt leírása és célközönsége alapján válaszd ki a MEGADOTT tevékenységi kategóriák közül azokat, amelyek relevánsak a projektre. KIZÁRÓLAG a megadott listából választhatsz, új kategóriát soha ne találj ki. Válaszod KIZÁRÓLAG JSON: {"categories":["pontosan a listából"]}';

function parseJsonBlock(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error("Az AI válasza nem értelmezhető.");
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeBands(value: unknown): RevenueBand[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      label: String(row["label"] ?? "").trim(),
      min: typeof row["min"] === "number" ? row["min"] : null,
      max: typeof row["max"] === "number" ? row["max"] : null,
    }))
    .filter((band) => band.label.length > 0);
}

/**
 * Exposes the organization's Opten export settings (revenue bands + remembered
 * Excel column mapping) to non-admin users too — the settings table itself is
 * admin-only via RLS.
 */
export const getOptenConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OptenConfig> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!profile) return { bands: [], columnMapping: null };

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("opten_revenue_bands, opten_excel_column_mapping")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    return {
      bands: normalizeBands(settings?.opten_revenue_bands),
      columnMapping: (settings?.opten_excel_column_mapping ?? null) as ExcelColumnMapping | null,
    };
  });

/** Persists the confirmed import column mapping (admin-only table, so server-side). */
export const saveExcelColumnMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mapping: ExcelColumnMapping }) => {
    if (!input?.mapping || typeof input.mapping !== "object") throw new Error("mapping szükséges");
    return { mapping: input.mapping };
  })
  .handler(async ({ data, context }): Promise<{ status: "ok" }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!profile) return { status: "ok" };

    await supabaseAdmin
      .from("settings")
      .update({ opten_excel_column_mapping: data.mapping as never })
      .eq("organization_id", profile.organization_id);

    return { status: "ok" };
  });

/**
 * "opten-prospect-categorizer" — assigns a normalized Hungarian activity
 * category to every uncategorized prospect of the organization, in small
 * batches to keep AI cost down. Existing categories are passed into the prompt
 * so the model reuses them instead of inventing near-duplicates. Manually set
 * categories are never touched (only rows with activity_category IS NULL).
 */
export const categorizeOptenProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CategorizeResult> => {
    const { supabase } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!profile) return { status: "error", message: "A profil nem található." };

    const { data: pending, error: pendingError } = await supabase
      .from("opten_prospects")
      .select("id, company_name, teaor_code, teaor_description")
      .is("activity_category", null)
      .order("created_at", { ascending: true });
    if (pendingError) throw pendingError;

    if (!pending || pending.length === 0) {
      return { status: "nothing_to_do", message: "Minden cég kategorizálva van.", categorized: 0 };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("openai_api_key, anthropic_api_key, preferred_ai_provider")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    const { resolveAiProvider, generateText, isAiOutOfCreditError } = await import(
      "@/server/ai-provider.server"
    );
    const resolved = resolveAiProvider(settings);
    if (!resolved) return { status: "no_provider", message: "AI-szolgáltató nincs beállítva" };

    const { data: categorized } = await supabase
      .from("opten_prospects")
      .select("activity_category")
      .not("activity_category", "is", null);
    const known = new Set(
      (categorized ?? []).map((row) => row.activity_category!).filter(Boolean),
    );

    let updated = 0;
    const BATCH = 20;
    for (let index = 0; index < pending.length; index += BATCH) {
      const batch = pending.slice(index, index + BATCH);
      const userPrompt = [
        "Létező kategóriák (ezeket használd újra, ha illik):",
        known.size > 0 ? Array.from(known).map((c) => `- ${c}`).join("\n") : "- (még nincs)",
        "",
        "Cégek:",
        ...batch.map((row) =>
          [
            `- ${row.company_name}`,
            row.teaor_code ? `TEÁOR ${row.teaor_code}` : null,
            row.teaor_description,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ].join("\n");

      let text: string;
      try {
        const result = await generateText({
          provider: resolved.provider,
          apiKey: resolved.apiKey,
          systemPrompt: CATEGORIZER_SYSTEM_PROMPT,
          userPrompt,
          organizationId: profile.organization_id,
          maxTokens: 1500,
        });
        text = result.text;
      } catch (err) {
        if (isAiOutOfCreditError(err)) {
          return {
            status: "out_of_credit",
            message: "Elfogyott az AI-kredit, próbáld később",
            categorized: updated,
          };
        }
        return {
          status: "error",
          message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
          categorized: updated,
        };
      }

      let assignments: Array<{ company_name?: unknown; activity_category?: unknown }> = [];
      try {
        const parsed = parseJsonBlock(text) as { assignments?: unknown };
        assignments = Array.isArray(parsed.assignments) ? (parsed.assignments as never[]) : [];
      } catch {
        continue;
      }

      for (const assignment of assignments) {
        const name = String(assignment.company_name ?? "").trim();
        const category = String(assignment.activity_category ?? "").trim();
        if (!name || !category) continue;
        const row = batch.find(
          (item) => item.company_name.toLowerCase() === name.toLowerCase(),
        );
        if (!row) continue;
        const { error: updateError } = await supabase
          .from("opten_prospects")
          .update({ activity_category: category })
          .eq("id", row.id)
          .is("activity_category", null);
        if (!updateError) {
          known.add(category);
          updated += 1;
        }
      }
    }

    return { status: "ok", categorized: updated };
  });

/**
 * AI suggestion for a project's relevant activity categories. The model may
 * only pick from the categories that already exist in the organization's
 * prospect database — new categories are created at import time only.
 */
export const suggestProjectCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => {
    if (!input?.projectId) throw new Error("projectId szükséges");
    return { projectId: input.projectId };
  })
  .handler(async ({ data, context }): Promise<CategorySuggestionResult> => {
    const { supabase } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, title, description, city, size_sqm, target_audience")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return { status: "error", message: "A projekt nem található." };

    const { data: rows } = await supabase
      .from("opten_prospects")
      .select("activity_category")
      .not("activity_category", "is", null);
    const categories = Array.from(
      new Set((rows ?? []).map((row) => row.activity_category!).filter(Boolean)),
    );

    if (categories.length === 0) {
      return {
        status: "no_categories",
        message:
          "Még nincs kategorizált cég — importálj és kategorizálj cégeket a Talált cégek oldalon.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("openai_api_key, anthropic_api_key, preferred_ai_provider")
      .eq("organization_id", project.organization_id)
      .maybeSingle();

    const { resolveAiProvider, generateText, isAiOutOfCreditError } = await import(
      "@/server/ai-provider.server"
    );
    const resolved = resolveAiProvider(settings);
    if (!resolved) return { status: "no_provider", message: "AI-szolgáltató nincs beállítva" };

    const userPrompt = [
      `Projekt: ${project.title}`,
      project.city ? `Város: ${project.city}` : null,
      project.size_sqm ? `Méret: ${project.size_sqm} m²` : null,
      project.description ? `Leírás: ${project.description}` : null,
      project.target_audience ? `Célközönség: ${project.target_audience}` : null,
      "",
      "Választható tevékenységi kategóriák (kizárólag ezek közül):",
      ...categories.map((category) => `- ${category}`),
    ]
      .filter(Boolean)
      .join("\n");

    let text: string;
    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: PROJECT_CATEGORY_SYSTEM_PROMPT,
        userPrompt,
        organizationId: project.organization_id,
        maxTokens: 600,
      });
      text = result.text;
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { status: "out_of_credit", message: "Elfogyott az AI-kredit, próbáld később" };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
      };
    }

    let picked: string[] = [];
    try {
      const parsed = parseJsonBlock(text) as { categories?: unknown };
      picked = Array.isArray(parsed.categories)
        ? (parsed.categories as unknown[]).map((value) => String(value).trim())
        : [];
    } catch {
      return { status: "error", message: "Az AI válasza nem értelmezhető." };
    }

    return {
      status: "ok",
      categories: picked.filter((category) => categories.includes(category)),
    };
  });

const DOMAIN_SYSTEM_PROMPT =
  'Magyar cégek hivatalos weboldalát azonosító asszisztens vagy. Web keresés alapján add meg a megnevezett magyar cég hivatalos weboldalának domainjét. KIZÁRÓLAG akkor adj meg domaint, ha a keresési eredmények egyértelműen azonosítják — soha ne találj ki, ne tippelj és ne következtess a cégnévből domaint. Válaszod KIZÁRÓLAG JSON: {"domain":"pelda.hu"} vagy {"domain":null,"reason":"nem található"}. A domain protokoll és útvonal nélkül, kisbetűvel, www nélkül szerepeljen.';

function normalizeDomain(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "null" || raw.includes("nem található")) return null;
  const cleaned = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[),.;]+$/, "")
    .trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * AI web-search domain lookup for ONE prospect that has no domain yet.
 *
 * Never overwrites an existing domain: the final update is guarded with
 * `.is("domain", null)`, so a value coming from the Excel import ('opten_excel')
 * or a manual edit ('kezi') can never be replaced by an automated run.
 */
export const resolveProspectDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prospectId: string }) => {
    if (!input?.prospectId) throw new Error("prospectId szükséges");
    return { prospectId: input.prospectId };
  })
  .handler(async ({ data, context }): Promise<DomainLookupResult> => {
    const { supabase } = context;

    const { data: prospect, error } = await supabase
      .from("opten_prospects")
      .select("id, organization_id, company_name, city, domain")
      .eq("id", data.prospectId)
      .maybeSingle();
    if (error) throw error;
    if (!prospect) return { status: "error", message: "A cég nem található." };
    if (prospect.domain) return { status: "nothing_to_do", domain: prospect.domain };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("openai_api_key, anthropic_api_key, preferred_ai_provider")
      .eq("organization_id", prospect.organization_id)
      .maybeSingle();

    const { resolveAiProvider, generateTextWithWebSearch, isAiOutOfCreditError } = await import(
      "@/server/ai-provider.server"
    );
    const resolved = resolveAiProvider(settings);
    if (!resolved) return { status: "no_provider", message: "AI-szolgáltató nincs beállítva" };

    let text: string;
    let sources: string[] = [];
    try {
      const result = await generateTextWithWebSearch({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: DOMAIN_SYSTEM_PROMPT,
        userPrompt: [
          `Cég neve: ${prospect.company_name}`,
          prospect.city ? `Település: ${prospect.city}` : null,
          "",
          "Keresd meg a cég hivatalos weboldalát. Ha a találatok nem azonosítják egyértelműen, válaszolj: {\"domain\":null,\"reason\":\"nem található\"}.",
        ]
          .filter(Boolean)
          .join("\n"),
        organizationId: prospect.organization_id,
        maxTokens: 800,
      });
      text = result.text;
      sources = result.sources;
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { status: "out_of_credit", message: "Elfogyott az AI-kredit, próbáld később" };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
      };
    }

    let domain: string | null = null;
    try {
      const parsed = parseJsonBlock(text) as { domain?: unknown };
      domain = normalizeDomain(parsed.domain);
    } catch {
      domain = null;
    }

    if (!domain) return { status: "not_found" };

    const { error: updateError } = await supabase
      .from("opten_prospects")
      .update({ domain, domain_source: "ai_web_search" })
      .eq("id", prospect.id)
      .is("domain", null);
    if (updateError) return { status: "error", message: updateError.message };

    return { status: "ok", domain, ...(sources[0] ? { sourceUrl: sources[0] } : {}) };
  });
