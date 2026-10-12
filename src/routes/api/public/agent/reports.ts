import { createFileRoute } from "@tanstack/react-router";

import { REPORT_TYPE_MAP } from "@/lib/agent-rules";
import { agentHandler, fail, json, readJson } from "@/server/agent-api.server";
import { db, optionalText } from "@/server/agent-data.server";
import type { Json } from "@/integrations/supabase/types";

/** Inserts an agent-written report into market_reports, shown in the "Riportok" calendar. */
export const Route = createFileRoute("/api/public/agent/reports")({
  server: {
    handlers: {
      POST: agentHandler(
        () => "POST /api/public/agent/reports",
        async (ctx, request) => {
          const body = await readJson(request);
          if (!body) return fail(400, "JSON object body required");

          const type = typeof body["type"] === "string" ? body["type"] : "";
          const reportType = Object.prototype.hasOwnProperty.call(REPORT_TYPE_MAP, type)
            ? REPORT_TYPE_MAP[type]
            : undefined;
          if (!reportType) return fail(400, "type must be one of: napi, heti, piaci");

          const date = typeof body["date"] === "string" ? body["date"].trim() : "";
          const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
          if (
            !parsed ||
            Number.isNaN(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date
          ) {
            return fail(400, "date must be YYYY-MM-DD");
          }
          const title = optionalText(body["title"], 300);
          if (!title) return fail(400, "title required");
          const markdown =
            typeof body["body_markdown"] === "string" ? body["body_markdown"].trim() : "";
          if (!markdown) return fail(400, "body_markdown required");
          const keyData = body["key_data"];
          if (
            keyData !== undefined &&
            keyData !== null &&
            (typeof keyData !== "object" || Array.isArray(keyData))
          ) {
            return fail(400, "key_data must be an object");
          }

          // Idempotent on retries: same type + date + title returns the existing report.
          const { data: existing } = await db(ctx)
            .from("market_reports")
            .select("id")
            .eq("organization_id", ctx.organizationId)
            .eq("report_type", reportType)
            .eq("report_date", date)
            .eq("title", title)
            .limit(1);
          if (existing?.[0]) return json({ id: existing[0].id, duplicate: true });

          const periodStart = new Date(parsed);
          if (type === "heti") periodStart.setUTCDate(periodStart.getUTCDate() - 6);

          const { data, error } = await db(ctx)
            .from("market_reports")
            .insert({
              organization_id: ctx.organizationId,
              report_type: reportType,
              report_date: date,
              period_start: periodStart.toISOString().slice(0, 10),
              period_end: date,
              year: parsed.getUTCFullYear(),
              title,
              summary: markdown,
              source_name: "Claude agent",
              source_url: null,
              key_data: (keyData ?? {}) as Json,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);

          return json({ id: data.id, reportType }, 201);
        },
      ),
    },
  },
});
