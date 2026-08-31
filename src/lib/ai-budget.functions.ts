import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AiBudgetStatus {
  hasProvider: boolean;
  provider: "openai" | "anthropic" | null;
  monthlyBudgetUsd: number | null;
  estimatedUsd: number;
  budgetWarning: boolean;
  outOfCredit: boolean;
}

/**
 * Non-sensitive AI budget / credit state for the current user's organization.
 * Readable by any signed-in member (settings itself is admin-only via RLS),
 * so the Dashboard can show the warning banners.
 */
export const getAiBudgetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiBudgetStatus> => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const empty: AiBudgetStatus = {
      hasProvider: false,
      provider: null,
      monthlyBudgetUsd: null,
      estimatedUsd: 0,
      budgetWarning: false,
      outOfCredit: false,
    };
    if (!profile) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveAiProvider } = await import("@/server/ai-provider.server");

    const { data: settings, error } = await supabaseAdmin
      .from("settings")
      .select(
        "openai_api_key, anthropic_api_key, preferred_ai_provider, monthly_ai_budget_usd, ai_usage_estimated_usd, ai_budget_warning_sent_at, ai_provider_out_of_credit",
      )
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (!settings) return empty;

    const resolved = resolveAiProvider(settings);
    const budget = settings.monthly_ai_budget_usd != null ? Number(settings.monthly_ai_budget_usd) : null;
    const used = Number(settings.ai_usage_estimated_usd ?? 0);

    return {
      hasProvider: Boolean(resolved),
      provider: resolved?.provider ?? null,
      monthlyBudgetUsd: budget,
      estimatedUsd: used,
      budgetWarning: Boolean(
        (budget && budget > 0 && used >= budget * 0.8) || settings.ai_budget_warning_sent_at,
      ) && Boolean(budget && budget > 0 && used >= budget * 0.8),
      outOfCredit: Boolean(settings.ai_provider_out_of_credit),
    };
  });
