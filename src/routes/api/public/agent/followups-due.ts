import { createFileRoute } from "@tanstack/react-router";

import { clampLimit, dueFollowUpStep, followUpNumberToStep } from "@/lib/agent-rules";
import { agentHandler, json } from "@/server/agent-api.server";
import {
  chunk,
  db,
  fetchAll,
  getSettings,
  loadBlocklist,
  parseSchedule,
} from "@/server/agent-data.server";

type QueueRow = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  subject: string | null;
  body: string | null;
  follow_up_number: number;
  status: string;
  sent_at: string | null;
};

/**
 * Sent outreach without a reply whose next step is due per settings.follow_up_schedule
 * and that has no queued follow-up yet. Same eligibility as the follow-up-generator cron:
 * company not opted out, CRM status still "nincs_valasz", follow-ups not paused.
 */
export const Route = createFileRoute("/api/public/agent/followups-due")({
  server: {
    handlers: {
      GET: agentHandler(
        () => "GET /api/public/agent/followups-due",
        async (ctx, request) => {
          const org = ctx.organizationId;
          const limit = clampLimit(new URL(request.url).searchParams.get("limit"), 50);
          const now = new Date();
          const settings = await getSettings(ctx);
          const schedule = parseSchedule(settings?.follow_up_schedule);
          if (schedule.length === 0) return json({ count: 0, followups: [] });

          const rows = await fetchAll<QueueRow>((from, to) =>
            db(ctx)
              .from("emails_queue")
              .select(
                "id, company_id, contact_id, subject, body, follow_up_number, status, sent_at",
              )
              .eq("organization_id", org)
              .not("company_id", "is", null)
              .neq("status", "elvetve")
              .order("created_at", { ascending: false })
              .range(from, to),
          );

          const byCompany = new Map<string, QueueRow[]>();
          for (const row of rows) {
            const list = byCompany.get(row.company_id as string) ?? [];
            list.push(row);
            byCompany.set(row.company_id as string, list);
          }

          type Candidate = { last: QueueRow; nextStep: number; sentIds: string[] };
          const candidates = new Map<string, Candidate>();
          for (const [companyId, list] of byCompany) {
            const sent = list
              .filter((r) => r.status === "elkuldot" && r.sent_at)
              .sort((a, b) => (b.sent_at as string).localeCompare(a.sent_at as string));
            const last = sent[0];
            if (!last) continue;
            const nextStep = dueFollowUpStep(
              followUpNumberToStep(last.follow_up_number),
              new Date(last.sent_at as string),
              schedule,
              now,
            );
            if (nextStep == null) continue;
            // a later step already exists (queued, approved or sent)
            if (list.some((r) => followUpNumberToStep(r.follow_up_number) >= nextStep)) continue;
            candidates.set(companyId, { last, nextStep, sentIds: sent.map((r) => r.id) });
          }
          if (candidates.size === 0) return json({ count: 0, followups: [] });

          // any reply to any sent email of the company stops the sequence
          const replied = new Set<string>();
          const emailToCompany = new Map<string, string>();
          for (const [companyId, c] of candidates) {
            for (const id of c.sentIds) emailToCompany.set(id, companyId);
          }
          for (const ids of chunk([...emailToCompany.keys()])) {
            const { data, error } = await db(ctx)
              .from("responses")
              .select("email_id")
              .eq("organization_id", org)
              .in("email_id", ids);
            if (error) throw new Error(error.message);
            for (const r of data ?? []) {
              const companyId = r.email_id ? emailToCompany.get(r.email_id) : undefined;
              if (companyId) replied.add(companyId);
            }
          }

          const companyIds = [...candidates.keys()].filter((id) => !replied.has(id));
          const companies = new Map<
            string,
            { name: string; ok: boolean; prospectId: string | null }
          >();
          const contacts = new Map<string, { email: string | null; name: string }>();
          for (const ids of chunk(companyIds)) {
            const [crm, prospects] = await Promise.all([
              db(ctx)
                .from("companies")
                .select("id, name, opt_out, status, follow_up_paused_until")
                .eq("organization_id", org)
                .in("id", ids),
              db(ctx)
                .from("opten_prospects")
                .select("id, company_id")
                .eq("organization_id", org)
                .in("company_id", ids),
            ]);
            if (crm.error) throw new Error(crm.error.message);
            if (prospects.error) throw new Error(prospects.error.message);
            for (const c of crm.data ?? []) {
              const paused = c.follow_up_paused_until && new Date(c.follow_up_paused_until) > now;
              companies.set(c.id, {
                name: c.name,
                ok: !c.opt_out && c.status === "nincs_valasz" && !paused,
                prospectId: (prospects.data ?? []).find((p) => p.company_id === c.id)?.id ?? null,
              });
            }
          }
          const contactIds = companyIds
            .map((id) => candidates.get(id)?.last.contact_id)
            .filter((v): v is string => Boolean(v));
          for (const ids of chunk(contactIds)) {
            const { data, error } = await db(ctx)
              .from("contacts")
              .select("id, name, email")
              .eq("organization_id", org)
              .in("id", ids);
            if (error) throw new Error(error.message);
            for (const c of data ?? []) contacts.set(c.id, { email: c.email, name: c.name });
          }

          const blocklist = await loadBlocklist(ctx);
          const followups: unknown[] = [];
          for (const companyId of companyIds) {
            const candidate = candidates.get(companyId);
            const company = companies.get(companyId);
            if (!candidate || !company?.ok) continue;
            const contact = candidate.last.contact_id
              ? contacts.get(candidate.last.contact_id)
              : undefined;
            const toEmail = contact?.email?.trim().toLowerCase();
            if (!toEmail || blocklist.has(toEmail)) continue;

            followups.push({
              queueId: candidate.last.id,
              companyId: company.prospectId ?? companyId,
              crmCompanyId: companyId,
              companyName: company.name,
              toEmail,
              toName: contact?.name ?? null,
              previousSubject: candidate.last.subject,
              previousBody: candidate.last.body,
              previousSentAt: candidate.last.sent_at,
              nextStep: candidate.nextStep,
            });
            if (followups.length >= limit) break;
          }

          return json({ count: followups.length, followups });
        },
      ),
    },
  },
});
