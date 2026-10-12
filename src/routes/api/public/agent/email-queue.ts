import { createFileRoute } from "@tanstack/react-router";

import { stepToFollowUpNumber } from "@/lib/agent-rules";
import { agentHandler, fail, isBlocked, json, readJson } from "@/server/agent-api.server";
import {
  PENDING_STATUSES,
  contactIdsByEmail,
  db,
  ensureContact,
  ensureCrmCompany,
  findCrmCompanyId,
  isUuid,
  loadProspect,
  normalizeEmail,
  optionalText,
} from "@/server/agent-data.server";

/**
 * Queues an agent-written email for human approval in "Email sor".
 * Never sends: the row gets status "varakozik" (awaiting approval) and only the
 * existing approve -> email-scheduler -> email-sender flow can send it.
 */
export const Route = createFileRoute("/api/public/agent/email-queue")({
  server: {
    handlers: {
      POST: agentHandler(
        () => "POST /api/public/agent/email-queue",
        async (ctx, request) => {
          const body = await readJson(request);
          if (!body) return fail(400, "JSON object body required");

          const companyRef = isUuid(body["company_id"]) ? body["company_id"] : "";
          const toEmail = normalizeEmail(body["to_email"]);
          const toName = optionalText(body["to_name"], 200) ?? null;
          const subject = optionalText(body["subject"], 300);
          const text = typeof body["body"] === "string" ? body["body"].trim() : "";
          const step = body["step"];
          const agentName = optionalText(body["agent"], 100) ?? "Claude agent";
          const note = optionalText(body["personalization_note"], 2000) ?? null;

          if (!companyRef) return fail(400, "company_id (uuid) required");
          if (!toEmail) return fail(400, "Invalid to_email");
          if (!subject) return fail(400, "subject required");
          if (!text) return fail(400, "body required");
          if (typeof step !== "number" || !Number.isInteger(step) || step < 1 || step > 3) {
            return fail(400, "step must be 1, 2 or 3");
          }
          const followUpNumber = stepToFollowUpNumber(step);

          // company_id is a found-company (opten_prospects) id; a CRM company id is accepted too
          // (e.g. the companyId of /followups-due for companies that never were found companies).
          const prospect = await loadProspect(ctx, companyRef);
          let companyId: string | null = prospect ? await findCrmCompanyId(ctx, prospect) : null;
          if (!prospect) {
            const { data } = await db(ctx)
              .from("companies")
              .select("id")
              .eq("organization_id", ctx.organizationId)
              .eq("id", companyRef)
              .maybeSingle();
            if (!data) return fail(404, "Company not found");
            companyId = data.id;
          }

          if (await isBlocked(ctx, toEmail)) return fail(409, "Recipient is on the blocklist");

          if (companyId) {
            const { data: company } = await db(ctx)
              .from("companies")
              .select("opt_out")
              .eq("id", companyId)
              .maybeSingle();
            if (company?.opt_out) return fail(409, "Company opted out");

            const { data: pending } = await db(ctx)
              .from("emails_queue")
              .select("id")
              .eq("organization_id", ctx.organizationId)
              .eq("company_id", companyId)
              .eq("follow_up_number", followUpNumber)
              .in("status", [...PENDING_STATUSES])
              .limit(1);
            if ((pending ?? []).length > 0) {
              return fail(409, "A pending email for this company and step already exists");
            }
          }

          if (step === 1) {
            const contactIds = await contactIdsByEmail(ctx, toEmail);
            if (contactIds.length > 0) {
              const { data: sent } = await db(ctx)
                .from("emails_queue")
                .select("id")
                .eq("organization_id", ctx.organizationId)
                .in("contact_id", contactIds)
                .eq("follow_up_number", 0)
                .eq("status", "elkuldot")
                .limit(1);
              if ((sent ?? []).length > 0) {
                return fail(409, "Step 1 was already sent to this address");
              }
            }
          }

          if (prospect) companyId = await ensureCrmCompany(ctx, prospect);
          if (!companyId) return fail(404, "Company not found");

          const isDecisionMaker = prospect?.decision_maker_email?.trim().toLowerCase() === toEmail;
          const contactId = await ensureContact(
            ctx,
            companyId,
            toEmail,
            toName ?? (isDecisionMaker ? (prospect?.decision_maker_name ?? null) : null),
            isDecisionMaker ? (prospect?.decision_maker_position ?? null) : null,
          );

          const { data: inserted, error } = await db(ctx)
            .from("emails_queue")
            .insert({
              organization_id: ctx.organizationId,
              company_id: companyId,
              contact_id: contactId,
              subject,
              body: text,
              status: "varakozik",
              ai_generated: true,
              follow_up_number: followUpNumber,
              agent_name: agentName,
              personalization_note: note,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);

          return json({ id: inserted.id, companyId, contactId, status: "varakozik" }, 201);
        },
      ),
    },
  },
});
