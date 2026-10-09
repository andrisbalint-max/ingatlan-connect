import { RATE_LIMIT_PER_MINUTE } from "@/lib/agent-rules";

export interface AgentContext {
  organizationId: string;
  keyId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (status: number, error: string) => Response.json({ error }, { status });

/** Verifies the Bearer agent key, enforces the rate limit and returns the org context. */
export async function authenticateAgent(
  request: Request,
): Promise<{ ctx: AgentContext } | { response: Response }> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1]) return { response: fail(401, "Unauthorized") };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256Hex(match[1]);
  const { data: key } = await supabaseAdmin
    .from("agent_api_keys")
    .select("id, organization_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!key || key.revoked_at) return { response: fail(401, "Unauthorized") };

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", key.id)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return {
      response: Response.json(
        { error: "Rate limit exceeded (60 requests/minute)" },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
    };
  }

  await supabaseAdmin
    .from("agent_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id);

  return { ctx: { organizationId: key.organization_id, keyId: key.id, db: supabaseAdmin } };
}

export async function logAgent(ctx: AgentContext, description: string) {
  await ctx.db.from("activity_log").insert({
    organization_id: ctx.organizationId,
    actor: "Agent",
    description: description.slice(0, 300),
    api_key_id: ctx.keyId,
  });
}

/** Wraps a handler: auth + rate limit + activity log + error handling. */
export function agentHandler(
  label: (request: Request, params: Record<string, string>) => string,
  fn: (ctx: AgentContext, request: Request, params: Record<string, string>) => Promise<Response>,
) {
  return async ({ request, params }: { request: Request; params: Record<string, string> }) => {
    const auth = await authenticateAgent(request);
    if ("response" in auth) return auth.response;
    let response: Response;
    try {
      response = await fn(auth.ctx, request, params ?? {});
    } catch (err) {
      console.error("[agent-api]", err);
      response = fail(500, "Internal error");
    }
    await logAgent(auth.ctx, `${label(request, params ?? {})} (${response.status})`);
    return response;
  };
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function isBlocked(ctx: AgentContext, email: string) {
  const { data } = await ctx.db
    .from("email_blocklist")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .ilike("email", email.trim())
    .limit(1);
  return (data ?? []).length > 0;
}
