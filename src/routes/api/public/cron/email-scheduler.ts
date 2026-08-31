import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/email-scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orgs, error: orgsError } = await supabaseAdmin
          .from("settings")
          .select("organization_id, daily_email_limit, send_window_start, send_window_end, outlook_connected")
          .eq("outlook_connected", true);
        if (orgsError) {
          return Response.json({ success: false, error: orgsError.message }, { status: 500 });
        }

        const results: Array<{ organization_id: string; scheduled: number }> = [];

        for (const org of orgs ?? []) {
          const { data: rows, error: rowsError } = await supabaseAdmin
            .from("emails_queue")
            .select("id, created_at")
            .eq("organization_id", org.organization_id)
            .eq("status", "jovahagyva")
            .is("scheduled_for", null)
            .order("created_at", { ascending: true });
          if (rowsError) {
            return Response.json({ success: false, error: rowsError.message }, { status: 500 });
          }
          if (!rows || rows.length === 0) {
            results.push({ organization_id: org.organization_id, scheduled: 0 });
            continue;
          }

          const limit = Math.max(1, org.daily_email_limit ?? 30);
          const startTime = parseTime(org.send_window_start ?? "09:00");
          const endTime = parseTime(org.send_window_end ?? "16:00");


          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);

          const { data: sentToday, error: sentError } = await supabaseAdmin
            .from("emails_queue")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", org.organization_id)
            .eq("status", "elkuldot")
            .gte("sent_at", today.toISOString());
          if (sentError) {
            return Response.json({ success: false, error: sentError.message }, { status: 500 });
          }
          const alreadySent = sentToday?.length ?? 0;
          const remainingToday = Math.max(0, limit - alreadySent);

          let slot = nextSlotWithinWindow(new Date(), startTime, endTime);
          let scheduled = 0;

          for (const row of rows.slice(0, remainingToday)) {
            const { error: updateError } = await supabaseAdmin
              .from("emails_queue")
              .update({ scheduled_for: slot.toISOString() })
              .eq("id", row.id);
            if (updateError) {
              return Response.json({ success: false, error: updateError.message }, { status: 500 });
            }
            scheduled++;
            slot = addJitter(slot, startTime, endTime);
          }

          results.push({ organization_id: org.organization_id, scheduled });
        }

        return Response.json({ success: true, scheduled: results });
      },
    },
  },
});

function parseTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":").map((v) => parseInt(v, 10));
  return { hour: Number.isNaN(h) ? 9 : h, minute: Number.isNaN(m) ? 0 : m };
}

function nextSlotWithinWindow(now: Date, start: { hour: number; minute: number }, end: { hour: number; minute: number }): Date {
  const slot = new Date(now);
  slot.setUTCMinutes(slot.getUTCMinutes() + 5, 0, 0);

  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  const currentMinutes = slot.getUTCHours() * 60 + slot.getUTCMinutes();

  if (currentMinutes < startMinutes) {
    slot.setUTCHours(start.hour, start.minute, 0, 0);
  } else if (currentMinutes > endMinutes) {
    slot.setUTCDate(slot.getUTCDate() + 1);
    slot.setUTCHours(start.hour, start.minute, 0, 0);
  }

  return slot;
}

function addJitter(slot: Date, start: { hour: number; minute: number }, end: { hour: number; minute: number }): Date {
  const next = new Date(slot);
  const jitter = 15 + Math.floor(Math.random() * 11); // 15–25 minutes
  next.setUTCMinutes(next.getUTCMinutes() + jitter, 0, 0);

  const endMinutes = end.hour * 60 + end.minute;
  const currentMinutes = next.getUTCHours() * 60 + next.getUTCMinutes();

  if (currentMinutes > endMinutes) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(start.hour, start.minute, 0, 0);
  }

  return next;
}
