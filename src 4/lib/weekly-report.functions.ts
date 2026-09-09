import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { describeError } from "@/lib/error-details";

export interface ManualWeeklyReportResult {
  status: "ok" | "no_provider" | "out_of_credit" | "error";
  itemsFound: number;
  partnersChecked: number;
  partnerMovementsFound: number;
  message?: string | undefined;
}

const EMPTY = { itemsFound: 0, partnersChecked: 0, partnerMovementsFound: 0 } as const;

/**
 * Admin-only "Heti riport most" trigger.
 *
 * A teljes törzs try/catch-ben fut, hogy a hiba helye is látszódjon a
 * felületen (ld. `describeError`), ne csak a puszta hibaüzenet.
 */
export const runWeeklyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualWeeklyReportResult> => {
    try {
      const { data: profile, error: profileError } = await context.supabase
        .from("profiles")
        .select("role, organization_id")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== "admin") {
        return { status: "error", ...EMPTY, message: "Csak adminok futtathatják." };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: settings, error } = await supabaseAdmin
        .from("settings")
        .select("organization_id, openai_api_key, anthropic_api_key, preferred_ai_provider")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (error) throw error;
      if (!settings) {
        return { status: "error", ...EMPTY, message: "Nincs beállítás rekord." };
      }

      const { runWeeklyReportForOrg } = await import("@/server/weekly-report.server");
      const result = await runWeeklyReportForOrg(settings);
      return {
        status: result.status,
        itemsFound: result.itemsFound,
        partnersChecked: result.partnersChecked,
        partnerMovementsFound: result.partnerMovementsFound,
        message: result.message,
      };
    } catch (err) {
      console.error("[weekly-report] Manual run failed:", err);
      return { status: "error", ...EMPTY, message: describeError(err) };
    }
  });
