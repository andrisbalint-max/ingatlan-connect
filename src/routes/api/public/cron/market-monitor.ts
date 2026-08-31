import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/market-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { runMarketMonitorForAllOrgs } = await import("@/server/market-monitor.server");
        try {
          const results = await runMarketMonitorForAllOrgs();
          return Response.json({ success: true, results });
        } catch (err) {
          return Response.json(
            { success: false, error: err instanceof Error ? err.message : "unknown error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
