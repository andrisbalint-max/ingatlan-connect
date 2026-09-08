import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ManualWeeklyReportResult {
  status: "ok" | "no_provider" | "out_of_credit" | "error";
  itemsFound: number;
  partnersChecked: number;
  partnerMovementsFound: number;
  message?: string | undefined;
}

/** Admin-only "Heti riport generálása most" trigger. */
export const runWeeklyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualWeeklyReportResult> => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("role, organization_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") {
      return {
        status: "error",
        itemsFound: 0,
        partnersChecked: 0,
        partnerMovementsFound: 0,
        message: "Csak adminok futtathatják.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error } = await supabaseAdmin
      .from("settings")
      .select("organization_id, openai_api_key, anthropic_api_key, preferred_ai_provider")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (!settings) {
      return {
        status: "error",
        itemsFound: 0,
        partnersChecked: 0,
        partnerMovementsFound: 0,
        message: "Nincs beállítás rekord.",
      };
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
  });
