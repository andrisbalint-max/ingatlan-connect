import { createFileRoute } from "@tanstack/react-router";

import { agentHandler, json } from "@/server/agent-api.server";
import { db } from "@/server/agent-data.server";

export const Route = createFileRoute("/api/public/agent/projects")({
  server: {
    handlers: {
      GET: agentHandler(
        (request) => `GET /api/public/agent/projects${new URL(request.url).search}`,
        async (ctx, request) => {
          const status = new URL(request.url).searchParams.get("status")?.trim();
          let query = db(ctx)
            .from("projects")
            .select(
              "id, title, description, city, size_sqm, status, target_audience, target_activity_categories, created_at",
            )
            .eq("organization_id", ctx.organizationId);
          if (status) query = query.eq("status", status);
          const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
          if (error) throw new Error(error.message);

          return json({
            count: (data ?? []).length,
            projects: (data ?? []).map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              city: p.city,
              sizeSqm: p.size_sqm,
              status: p.status,
              targetAudience: p.target_audience,
              targetActivityCategories: p.target_activity_categories,
              createdAt: p.created_at,
            })),
          });
        },
      ),
    },
  },
});
