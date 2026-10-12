import { createFileRoute } from "@tanstack/react-router";

import { agentHandler, json } from "@/server/agent-api.server";
import {
  AWAITING_APPROVAL_STATUSES,
  budapestDayStart,
  db,
  getSettings,
  parseSchedule,
} from "@/server/agent-data.server";

export const Route = createFileRoute("/api/public/agent/stats")({
  server: {
    handlers: {
      GET: agentHandler(
        () => "GET /api/public/agent/stats",
        async (ctx) => {
          const org = ctx.organizationId;
          const today = budapestDayStart();
          const yesterday = budapestDayStart(new Date(), -1);

          const [
            settings,
            pending,
            sentToday,
            repliesYesterday,
            activeProjects,
            withoutDomain,
            withoutContact,
          ] = await Promise.all([
            getSettings(ctx),
            db(ctx)
              .from("emails_queue")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org)
              .in("status", [...AWAITING_APPROVAL_STATUSES]),
            db(ctx)
              .from("emails_queue")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org)
              .eq("status", "elkuldot")
              .gte("sent_at", today.toISOString()),
            db(ctx)
              .from("responses")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org)
              .gte("received_at", yesterday.toISOString())
              .lt("received_at", today.toISOString()),
            db(ctx)
              .from("projects")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org)
              .eq("status", "aktiv"),
            db(ctx)
              .from("opten_prospects")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org)
              .or("domain.is.null,domain.eq."),
            db(ctx)
              .from("opten_prospects")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org)
              .not("domain", "is", null)
              .neq("domain", "")
              .is("decision_maker_email", null),
          ]);

          return json({
            pendingApproval: pending.count ?? 0,
            sentToday: sentToday.count ?? 0,
            repliesYesterday: repliesYesterday.count ?? 0,
            activeProjects: activeProjects.count ?? 0,
            companiesWithoutDomain: withoutDomain.count ?? 0,
            companiesWithoutContact: withoutContact.count ?? 0,
            dailyLimit: settings?.daily_email_limit ?? 30,
            followUpScheduleDays: parseSchedule(settings?.follow_up_schedule),
          });
        },
      ),
    },
  },
});
