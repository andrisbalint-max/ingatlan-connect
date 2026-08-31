import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * "ai-budget-monitor" (daily): resets the estimated monthly AI spend at the
 * start of each calendar month and raises the 80% budget warning flag that the
 * Dashboard banner reads.
 */
export const Route = createFileRoute("/api/public/cron/ai-budget-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("settings")
          .select(
            "id, organization_id, monthly_ai_budget_usd, ai_usage_estimated_usd, ai_budget_warning_sent_at",
          );
        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        const now = new Date();
        const isFirstOfMonth = now.getUTCDate() === 1;
        const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
        const results: Array<{ organization_id: string; action: string }> = [];

        for (const row of rows ?? []) {
          let usage = Number(row.ai_usage_estimated_usd ?? 0);
          let warningSentAt = row.ai_budget_warning_sent_at as string | null;

          if (isFirstOfMonth) {
            await supabaseAdmin
              .from("settings")
              .update({ ai_usage_estimated_usd: 0, ai_budget_warning_sent_at: null })
              .eq("id", row.id);
            usage = 0;
            warningSentAt = null;
            results.push({ organization_id: row.organization_id, action: "monthly_reset" });
          }

          const budget = row.monthly_ai_budget_usd != null ? Number(row.monthly_ai_budget_usd) : null;
          if (!budget || budget <= 0) continue;

          const sentThisMonth = warningSentAt
            ? (() => {
                const d = new Date(warningSentAt);
                return `${d.getUTCFullYear()}-${d.getUTCMonth()}` === monthKey;
              })()
            : false;

          if (usage >= budget * 0.8 && !sentThisMonth) {
            await supabaseAdmin
              .from("settings")
              .update({ ai_budget_warning_sent_at: now.toISOString() })
              .eq("id", row.id);
            results.push({ organization_id: row.organization_id, action: "budget_warning" });
          }
        }

        return Response.json({ success: true, results });
      },
    },
  },
});
