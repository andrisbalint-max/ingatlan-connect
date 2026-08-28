import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface HunterPerson {
  name: string;
  email: string;
  position: string | null;
}

export interface HunterSearchResult {
  status: "ok" | "no_domain" | "no_api_key" | "error";
  message?: string;
  people: HunterPerson[];
}

/**
 * Looks up contacts for a company domain through the Hunter.io Domain Search API
 * using the organization's configured API key.
 */
export const hunterSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input || typeof input.companyId !== "string" || input.companyId.length === 0) {
      throw new Error("companyId szükséges");
    }
    return { companyId: input.companyId };
  })
  .handler(async ({ data, context }): Promise<HunterSearchResult> => {
    const { supabase } = context;

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, domain, organization_id")
      .eq("id", data.companyId)
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return { status: "error", message: "A cég nem található.", people: [] };
    }

    const domain = (company.domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!domain) {
      return { status: "no_domain", message: "Nincs domain megadva", people: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("settings")
      .select("hunter_api_key")
      .eq("organization_id", company.organization_id)
      .maybeSingle();

    if (settingsError) throw settingsError;

    const apiKey = (settings?.hunter_api_key ?? "").trim();
    if (!apiKey) {
      return {
        status: "no_api_key",
        message: "Állíts be Hunter API kulcsot a Beállításokban",
        people: [],
      };
    }

    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=25&api_key=${encodeURIComponent(apiKey)}`;

    let payload: unknown;
    try {
      const response = await fetch(url);
      payload = await response.json();
      if (!response.ok) {
        const errors = (payload as { errors?: Array<{ details?: string }> })?.errors;
        return {
          status: "error",
          message: errors?.[0]?.details ?? "A Hunter keresés nem sikerült.",
          people: [],
        };
      }
    } catch {
      return { status: "error", message: "A Hunter szolgáltatás nem elérhető.", people: [] };
    }

    const emails =
      (payload as {
        data?: {
          emails?: Array<{
            value?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            position?: string | null;
          }>;
        };
      }).data?.emails ?? [];

    const people: HunterPerson[] = emails
      .filter((entry) => Boolean(entry.value))
      .map((entry) => ({
        name: [entry.first_name, entry.last_name].filter(Boolean).join(" ").trim() || entry.value!,
        email: entry.value!,
        position: entry.position ?? null,
      }));

    return { status: "ok", people };
  });
