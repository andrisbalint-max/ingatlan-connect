import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { describeError } from "@/lib/error-details";

export interface ManualMarketMonitorResult {
  status: "ok" | "no_provider" | "out_of_credit" | "error";
  newItems: number;
  message?: string | undefined;
}

/**
 * Admin-only "Napi összegzés most" trigger for the market monitor.
 *
 * A teljes törzs try/catch-ben fut: bármi hasal el (adatbázis, AI-hívás,
 * feldolgozás), a hiba típusa és a hívási lánc eleje visszakerül a felületre,
 * és a szerverlogba is bekerül. Enélkül a felhasználó csak egy önmagában
 * értelmezhetetlen üzenetet látott.
 */
export const runMarketMonitorNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualMarketMonitorResult> => {
    try {
      const { data: profile, error: profileError } = await context.supabase
        .from("profiles")
        .select("role, organization_id")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== "admin") {
        return { status: "error", newItems: 0, message: "Csak adminok futtathatják." };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: settings, error } = await supabaseAdmin
        .from("settings")
        .select("organization_id, openai_api_key, anthropic_api_key, preferred_ai_provider")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (error) throw error;
      if (!settings) return { status: "error", newItems: 0, message: "Nincs beállítás rekord." };

      const { runMarketMonitorForOrg } = await import("@/server/market-monitor.server");
      const result = await runMarketMonitorForOrg(settings);
      return { status: result.status, newItems: result.newItems, message: result.message };
    } catch (err) {
      console.error("[market-monitor] Manual run failed:", err);
      return { status: "error", newItems: 0, message: describeError(err) };
    }
  });
