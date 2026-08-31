import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiCallStatus = "ok" | "no_provider" | "out_of_credit" | "error";

export interface RevenueBand {
  label: string;
  min: number | null;
  max: number | null;
}

export interface TeaorSuggestion {
  code: string;
  description: string;
}

export interface OptenConfig {
  hasApiKey: boolean;
  bands: RevenueBand[];
}

export interface CriteriaSuggestionResult {
  status: AiCallStatus | "no_bands";
  message?: string | undefined;
  teaorSuggestions?: TeaorSuggestion[] | undefined;
  revenueBandLabel?: string | undefined;
  bands?: RevenueBand[] | undefined;
}

export interface OptenSearchResult {
  status: "ok" | "no_api_key" | "no_criteria" | "not_implemented" | "error";
  message?: string | undefined;
  created?: number | undefined;
}

const CRITERIA_SYSTEM_PROMPT =
  'Ipari ingatlan B2B bróker asszisztens vagy. A projekt leírása és célközönsége alapján javasolj magyar TEÁOR (NACE Rev.2 magyar) kódokat a legvalószínűbb bérlő/vevő iparágakhoz, és válaszd ki a MEGADOTT árbevétel-sáv címkék közül a legjobban illeszkedőt. Soha ne találj ki olyan sávot, ami nincs a listában. Válaszod KIZÁRÓLAG JSON: {"teaor_suggestions":[{"code":"52.10","description":"rövid magyar tevékenységleírás"}],"revenue_band_label":"pontosan a listából"}. Legfeljebb 3 TEÁOR javaslat.';

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
 * Exposes the organization's Opten configuration to non-admin users too
 * (the settings table itself is admin-only via RLS), without ever leaking the key.
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
    if (!profile) return { hasApiKey: false, bands: [] };

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("opten_api_key, opten_revenue_bands")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    return {
      hasApiKey: Boolean((settings?.opten_api_key ?? "").trim()),
      bands: normalizeBands(settings?.opten_revenue_bands),
    };
  });

/**
 * AI suggestion for the Opten search criteria of a project: TEÁOR codes plus one
 * of the organization's configured revenue bands. Nothing is saved here — the
 * admin reviews and edits the suggestion, then saves it from the UI.
 */
export const suggestOptenCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => {
    if (!input?.projectId) throw new Error("projectId szükséges");
    return { projectId: input.projectId };
  })
  .handler(async ({ data, context }): Promise<CriteriaSuggestionResult> => {
    const { supabase } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, title, description, city, size_sqm, target_audience")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return { status: "error", message: "A projekt nem található." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select(
        "openai_api_key, anthropic_api_key, preferred_ai_provider, opten_revenue_bands",
      )
      .eq("organization_id", project.organization_id)
      .maybeSingle();

    const bands = normalizeBands(settings?.opten_revenue_bands);
    if (bands.length === 0) {
      return {
        status: "no_bands",
        message:
          "Még nincs beállítva árbevétel-sáv — add meg őket a Beállításokban (Opten kapcsolat), majd próbáld újra.",
        bands: [],
      };
    }

    const { resolveAiProvider, generateText, isAiOutOfCreditError } = await import(
      "@/server/ai-provider.server"
    );
    const resolved = resolveAiProvider(settings);
    if (!resolved) {
      return { status: "no_provider", message: "AI-szolgáltató nincs beállítva", bands };
    }

    const userPrompt = [
      `Projekt: ${project.title}`,
      project.city ? `Város: ${project.city}` : null,
      project.size_sqm ? `Méret: ${project.size_sqm} m²` : null,
      project.description ? `Leírás: ${project.description}` : null,
      project.target_audience ? `Célközönség: ${project.target_audience}` : null,
      "",
      "Választható árbevétel-sáv címkék (csak ezek közül válassz egyet):",
      ...bands.map((band) => `- ${band.label}`),
    ]
      .filter(Boolean)
      .join("\n");

    let text: string;
    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: CRITERIA_SYSTEM_PROMPT,
        userPrompt,
        organizationId: project.organization_id,
        maxTokens: 700,
      });
      text = result.text;
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { status: "out_of_credit", message: "Elfogyott az AI-kredit, próbáld később", bands };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
        bands,
      };
    }

    let parsed: { teaor_suggestions?: unknown; revenue_band_label?: unknown };
    try {
      parsed = parseJsonBlock(text) as typeof parsed;
    } catch {
      return { status: "error", message: "Az AI válasza nem értelmezhető.", bands };
    }

    const teaorSuggestions: TeaorSuggestion[] = Array.isArray(parsed.teaor_suggestions)
      ? parsed.teaor_suggestions
          .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
          .slice(0, 3)
          .map((row) => ({
            code: String(row["code"] ?? "").trim(),
            description: String(row["description"] ?? "").trim(),
          }))
          .filter((row) => row.code.length > 0 || row.description.length > 0)
      : [];

    const suggestedLabel = String(parsed.revenue_band_label ?? "").trim();
    const validLabel = bands.find((band) => band.label === suggestedLabel)?.label;

    return {
      status: "ok",
      teaorSuggestions,
      revenueBandLabel: validLabel ?? undefined,
      bands,
    };
  });

/**
 * "opten-search" — PLACEHOLDER.
 *
 * Opten's real technical integration is not confirmed yet (the auth method could
 * be a SOAP client certificate, a username/password pair, or a simple API key),
 * so this function only validates the stored credential and returns a friendly
 * not-yet-implemented response.
 *
 * When the real API docs arrive, ONLY the body of `fetchOptenCompanies` below has
 * to change: it receives (criteria, apiKey) and is expected to return an array of
 * { company_name, teaor_code, teaor_description, net_revenue_band, city, domain,
 * raw_opten_data } objects. Everything around it (upsert into opten_prospects,
 * skipping duplicates via UNIQUE (project_id, company_name)) already works.
 */
interface OptenCompany {
  company_name: string;
  teaor_code?: string | null;
  teaor_description?: string | null;
  net_revenue_band?: string | null;
  city?: string | null;
  domain?: string | null;
  raw_opten_data?: unknown;
}

interface OptenCriteria {
  teaor_suggestions?: TeaorSuggestion[];
  revenue_band_label?: string;
}

async function fetchOptenCompanies(
  _criteria: OptenCriteria,
  _apiKey: string,
): Promise<{ implemented: boolean; companies: OptenCompany[] }> {
  // TODO(opten): replace with the real Opten query once the technical docs and
  // the confirmed credential format are available.
  return { implemented: false, companies: [] };
}

export const runOptenSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => {
    if (!input?.projectId) throw new Error("projectId szükséges");
    return { projectId: input.projectId };
  })
  .handler(async ({ data, context }): Promise<OptenSearchResult> => {
    const { supabase } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, opten_search_criteria")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return { status: "error", message: "A projekt nem található." };

    const criteria = (project.opten_search_criteria ?? null) as OptenCriteria | null;
    if (!criteria) {
      return {
        status: "no_criteria",
        message: "Először mentsd el a keresési kritériumokat.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("opten_api_key")
      .eq("organization_id", project.organization_id)
      .maybeSingle();

    const apiKey = (settings?.opten_api_key ?? "").trim();
    if (!apiKey) {
      return { status: "no_api_key", message: "Nincs beállítva Opten API kulcs a Beállításokban" };
    }

    const { implemented, companies } = await fetchOptenCompanies(criteria, apiKey);
    if (!implemented) {
      return {
        status: "not_implemented",
        message:
          "Az Opten integráció még nincs technikailag bekötve — a keresési kritériumok el vannak mentve, a tényleges lekérdezés hamarosan élesedik.",
      };
    }

    const { data: existing } = await supabase
      .from("opten_prospects")
      .select("company_name")
      .eq("project_id", project.id);
    const known = new Set((existing ?? []).map((row) => row.company_name));

    const rows = companies
      .filter((company) => company.company_name && !known.has(company.company_name))
      .map((company) => ({
        organization_id: project.organization_id,
        project_id: project.id,
        company_name: company.company_name,
        teaor_code: company.teaor_code ?? null,
        teaor_description: company.teaor_description ?? null,
        net_revenue_band: company.net_revenue_band ?? null,
        city: company.city ?? null,
        domain: company.domain ?? null,
        raw_opten_data: (company.raw_opten_data ?? null) as never,
      }));

    if (rows.length === 0) return { status: "ok", created: 0 };

    const { error: insertError } = await supabase.from("opten_prospects").insert(rows);
    if (insertError) throw insertError;

    return { status: "ok", created: rows.length };
  });
