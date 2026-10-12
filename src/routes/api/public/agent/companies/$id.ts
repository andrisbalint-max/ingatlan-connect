import { createFileRoute } from "@tanstack/react-router";

import { isProtectedSource } from "@/lib/agent-rules";
import { agentHandler, fail, json, readJson } from "@/server/agent-api.server";
import {
  db,
  isUuid,
  loadProspect,
  normalizeConfidence,
  normalizeDomain,
  normalizeEmail,
  optionalText,
} from "@/server/agent-data.server";
import type { Database } from "@/integrations/supabase/types";

type ProspectUpdate = Database["public"]["Tables"]["opten_prospects"]["Update"];

export const Route = createFileRoute("/api/public/agent/companies/$id")({
  server: {
    handlers: {
      PATCH: agentHandler(
        (_request, params) => `PATCH /api/public/agent/companies/${params["id"] ?? ""}`,
        async (ctx, request, params) => {
          const id = params["id"] ?? "";
          if (!isUuid(id)) return fail(404, "Company not found");
          const body = await readJson(request);
          if (!body) return fail(400, "JSON object body required");

          const prospect = await loadProspect(ctx, id);
          if (!prospect) return fail(404, "Company not found");

          const overwrite = body["overwrite"] === true;
          const update: ProspectUpdate = {};
          const skipped: string[] = [];

          if (body["domain"] !== undefined && body["domain"] !== null) {
            const domain = normalizeDomain(body["domain"]);
            if (!domain) return fail(400, "Invalid domain");
            if (prospect.domain && isProtectedSource(prospect.domain_source) && !overwrite) {
              skipped.push("domain (protected source)");
            } else if (domain !== prospect.domain) {
              update.domain = domain;
              // "agent" is shown with the same "AI-javaslat — ellenőrizd" badge as AI web search.
              update.domain_source = "agent";
              if (prospect.hunter_status === "nincs_domain") update.hunter_status = "nincs_inditva";
            }
          }

          const dm = body["decision_maker"];
          if (dm !== undefined && dm !== null) {
            if (typeof dm !== "object" || Array.isArray(dm)) {
              return fail(400, "decision_maker must be an object");
            }
            const person = dm as Record<string, unknown>;
            const email = normalizeEmail(person["email"]);
            if (!email) return fail(400, "Invalid decision_maker.email");
            const sourceUrl = optionalText(person["source_url"], 500) ?? null;
            if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
              return fail(400, "Invalid decision_maker.source_url");
            }
            if (
              prospect.decision_maker_email &&
              isProtectedSource(prospect.decision_maker_source) &&
              !overwrite
            ) {
              skipped.push("decision_maker (protected source)");
            } else {
              update.decision_maker_name = optionalText(person["name"], 200) ?? email;
              update.decision_maker_email = email;
              update.decision_maker_position = optionalText(person["title"], 200) ?? null;
              update.decision_maker_match_confidence = normalizeConfidence(person["confidence"]);
              update.decision_maker_source = "agent";
              update.decision_maker_source_url = sourceUrl;
            }
          }

          const note = optionalText(body["note"], 2000);
          if (note !== undefined) update.agent_note = note;

          if (Object.keys(update).length > 0) {
            const { error } = await db(ctx)
              .from("opten_prospects")
              .update(update)
              .eq("organization_id", ctx.organizationId)
              .eq("id", prospect.id);
            if (error) throw new Error(error.message);
          }

          return json({ id: prospect.id, updated: Object.keys(update), skipped });
        },
      ),
    },
  },
});
