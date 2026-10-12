import { createFileRoute } from "@tanstack/react-router";

import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/agent-rules";
import { agentHandler, fail, isBlocked, json, readJson } from "@/server/agent-api.server";
import { db, isUuid, optionalText } from "@/server/agent-data.server";
import type { Database } from "@/integrations/supabase/types";

type ResponseCategory = Database["public"]["Enums"]["response_category"];
type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];

/**
 * Agent category -> the app's own response category + CRM company effect,
 * mirroring src/server/response-classifier.server.ts:
 *  - érdeklődik: positive reply, follow-ups stop (status "erdeklodik", pause cleared)
 *  - később: replied, follow-ups stop (status "valaszolt")
 *  - nem releváns / leiratkozás: like the classifier's "elutasitas" (lezarva + opt_out)
 *  - visszapattant: automatic message, no company change
 */
const MAPPING: Record<
  ReplyCategory,
  { category: ResponseCategory | null; company?: CompanyUpdate }
> = {
  érdeklődik: {
    category: "erdeklodes",
    company: { status: "erdeklodik", follow_up_paused_until: null },
  },
  később: { category: null, company: { status: "valaszolt" } },
  "nem releváns": { category: "elutasitas", company: { status: "lezarva", opt_out: true } },
  leiratkozás: { category: "elutasitas", company: { status: "lezarva", opt_out: true } },
  visszapattant: { category: "autovalasz" },
  egyéb: { category: null },
};

export const Route = createFileRoute("/api/public/agent/replies/$id")({
  server: {
    handlers: {
      PATCH: agentHandler(
        (_request, params) => `PATCH /api/public/agent/replies/${params["id"] ?? ""}`,
        async (ctx, request, params) => {
          const id = params["id"] ?? "";
          if (!isUuid(id)) return fail(404, "Reply not found");
          const body = await readJson(request);
          if (!body) return fail(400, "JSON object body required");

          const category = body["category"];
          if (
            typeof category !== "string" ||
            !(REPLY_CATEGORIES as readonly string[]).includes(category)
          ) {
            return fail(400, `category must be one of: ${REPLY_CATEGORIES.join(", ")}`);
          }
          const agentCategory = category as ReplyCategory;
          const summary = optionalText(body["summary"], 4000) ?? null;
          const suggestedReply = optionalText(body["suggested_reply"], 8000) ?? null;

          const { data: reply, error } = await db(ctx)
            .from("responses")
            .select("id, email_id")
            .eq("organization_id", ctx.organizationId)
            .eq("id", id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!reply) return fail(404, "Reply not found");

          let companyId: string | null = null;
          let senderEmail: string | null = null;
          if (reply.email_id) {
            const { data: email } = await db(ctx)
              .from("emails_queue")
              .select("company_id, contact_id")
              .eq("organization_id", ctx.organizationId)
              .eq("id", reply.email_id)
              .maybeSingle();
            companyId = email?.company_id ?? null;
            if (email?.contact_id) {
              const { data: contact } = await db(ctx)
                .from("contacts")
                .select("email")
                .eq("id", email.contact_id)
                .maybeSingle();
              senderEmail = contact?.email?.trim().toLowerCase() || null;
            }
          }

          const mapping = MAPPING[agentCategory];
          const actions: string[] = [];

          if (companyId && mapping.company) {
            const { error: companyError } = await db(ctx)
              .from("companies")
              .update(mapping.company)
              .eq("organization_id", ctx.organizationId)
              .eq("id", companyId);
            if (companyError) throw new Error(companyError.message);
            actions.push(`company:${mapping.company.status ?? "updated"}`);
          }

          if (agentCategory === "leiratkozás" && senderEmail) {
            if (!(await isBlocked(ctx, senderEmail))) {
              const { error: blockError } = await db(ctx).from("email_blocklist").insert({
                organization_id: ctx.organizationId,
                email: senderEmail,
                reason: "Leiratkozás (válasz alapján, agent)",
                source: "leiratkozas",
              });
              if (blockError) throw new Error(blockError.message);
            }
            actions.push("blocklisted");
          }

          const { error: updateError } = await db(ctx)
            .from("responses")
            .update({
              agent_category: agentCategory,
              agent_summary: summary,
              suggested_reply: suggestedReply,
              agent_processed_at: new Date().toISOString(),
              handled: true,
              ...(mapping.category ? { category: mapping.category } : {}),
            })
            .eq("organization_id", ctx.organizationId)
            .eq("id", reply.id);
          if (updateError) throw new Error(updateError.message);

          return json({ id: reply.id, category: agentCategory, actions });
        },
      ),
    },
  },
});
