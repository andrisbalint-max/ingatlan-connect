import { createFileRoute } from "@tanstack/react-router";

import { clampLimit, followUpNumberToStep } from "@/lib/agent-rules";
import { agentHandler, fail, json } from "@/server/agent-api.server";
import { chunk, db } from "@/server/agent-data.server";

const STATUSES = ["unprocessed", "processed", "all"] as const;

export const Route = createFileRoute("/api/public/agent/replies/")({
  server: {
    handlers: {
      GET: agentHandler(
        (request) => `GET /api/public/agent/replies${new URL(request.url).search}`,
        async (ctx, request) => {
          const params = new URL(request.url).searchParams;
          const status = params.get("status") ?? "unprocessed";
          if (!(STATUSES as readonly string[]).includes(status)) {
            return fail(400, "status must be one of: unprocessed, processed, all");
          }
          const limit = clampLimit(params.get("limit"));

          let query = db(ctx)
            .from("responses")
            .select(
              "id, email_id, received_at, raw_text, category, agent_category, agent_summary, suggested_reply, agent_processed_at",
            )
            .eq("organization_id", ctx.organizationId);
          if (status === "unprocessed") query = query.is("agent_processed_at", null);
          if (status === "processed") query = query.not("agent_processed_at", "is", null);
          const { data: replies, error } = await query
            .order("received_at", { ascending: status === "unprocessed" })
            .limit(limit);
          if (error) throw new Error(error.message);

          const emailIds = [
            ...new Set((replies ?? []).map((r) => r.email_id).filter(Boolean)),
          ] as string[];
          const emails = new Map<
            string,
            {
              subject: string | null;
              company_id: string | null;
              contact_id: string | null;
              follow_up_number: number;
              sent_at: string | null;
            }
          >();
          for (const ids of chunk(emailIds)) {
            const { data, error: emailError } = await db(ctx)
              .from("emails_queue")
              .select("id, subject, company_id, contact_id, follow_up_number, sent_at")
              .eq("organization_id", ctx.organizationId)
              .in("id", ids);
            if (emailError) throw new Error(emailError.message);
            for (const e of data ?? []) emails.set(e.id, e);
          }

          const companyIds = [
            ...new Set([...emails.values()].map((e) => e.company_id).filter(Boolean)),
          ] as string[];
          const contactIds = [
            ...new Set([...emails.values()].map((e) => e.contact_id).filter(Boolean)),
          ] as string[];
          const companies = new Map<string, string>();
          const contacts = new Map<string, { name: string; email: string | null }>();
          for (const ids of chunk(companyIds)) {
            const { data } = await db(ctx)
              .from("companies")
              .select("id, name")
              .eq("organization_id", ctx.organizationId)
              .in("id", ids);
            for (const c of data ?? []) companies.set(c.id, c.name);
          }
          for (const ids of chunk(contactIds)) {
            const { data } = await db(ctx)
              .from("contacts")
              .select("id, name, email")
              .eq("organization_id", ctx.organizationId)
              .in("id", ids);
            for (const c of data ?? []) contacts.set(c.id, { name: c.name, email: c.email });
          }

          const items = (replies ?? []).map((r) => {
            const email = r.email_id ? emails.get(r.email_id) : undefined;
            const contact = email?.contact_id ? contacts.get(email.contact_id) : undefined;
            return {
              id: r.id,
              receivedAt: r.received_at,
              text: r.raw_text,
              category: r.category,
              agentCategory: r.agent_category,
              agentSummary: r.agent_summary,
              suggestedReply: r.suggested_reply,
              agentProcessedAt: r.agent_processed_at,
              originalEmail: email
                ? {
                    queueId: r.email_id,
                    subject: email.subject,
                    step: followUpNumberToStep(email.follow_up_number),
                    sentAt: email.sent_at,
                    companyId: email.company_id,
                    companyName: email.company_id
                      ? (companies.get(email.company_id) ?? null)
                      : null,
                    contactName: contact?.name ?? null,
                    contactEmail: contact?.email ?? null,
                  }
                : null,
            };
          });

          return json({ status, count: items.length, replies: items });
        },
      ),
    },
  },
});
