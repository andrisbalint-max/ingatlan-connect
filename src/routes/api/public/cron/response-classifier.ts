import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { classifyPendingResponses } from "@/server/response-classifier.server";

export const Route = createFileRoute("/api/public/cron/response-classifier")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orgs, error } = await supabaseAdmin
          .from("settings")
          .select("organization_id");
        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ organization_id: string; processed: number; skipped?: string }> = [];

        for (const org of orgs ?? []) {
          try {
            const outcome = await classifyPendingResponses(org.organization_id);
            results.push({ organization_id: org.organization_id, ...outcome });
          } catch (err) {
            console.error(
              `[response-classifier] Failed for org ${org.organization_id}:`,
              err instanceof Error ? err.message : err,
            );
            results.push({ organization_id: org.organization_id, processed: 0, skipped: "error" });
          }
        }

        return Response.json({ success: true, results });
      },
    },
  },
});
