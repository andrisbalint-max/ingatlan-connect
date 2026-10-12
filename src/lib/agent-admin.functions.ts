import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface AgentKeyRow {
  id: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface BlocklistRow {
  id: string;
  email: string;
  reason: string | null;
  source: string;
  created_at: string;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Current user's profile; throws unless signed in (and admin when required). */
async function loadProfile(
  context: { supabase: SupabaseClient<Database>; userId: string },
  requireAdmin: boolean,
) {
  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("organization_id, role, email")
    .eq("auth_user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error("Profile not found.");
  if (requireAdmin && profile.role !== "admin") {
    throw new Error("Ehhez admin jogosultság szükséges.");
  }
  return profile;
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // 30 bytes -> exactly 40 url-safe base64 characters, no padding
  return `rec_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_")}`;
}

export const listAgentKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentKeyRow[]> => {
    const profile = await loadProfile(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("agent_api_keys")
      .select("id, key_prefix, created_at, last_used_at, revoked_at")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Creates a key and returns the plain value ONCE; only its sha256 hash is stored. */
export const generateAgentKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ key: string; row: AgentKeyRow }> => {
    const profile = await loadProfile(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256Hex } = await import("@/server/agent-api.server");

    const key = randomKey();
    const { data, error } = await supabaseAdmin
      .from("agent_api_keys")
      .insert({
        organization_id: profile.organization_id,
        key_hash: await sha256Hex(key),
        key_prefix: key.slice(0, 8),
      })
      .select("id, key_prefix, created_at, last_used_at, revoked_at")
      .single();
    if (error) throw error;

    await supabaseAdmin.from("activity_log").insert({
      organization_id: profile.organization_id,
      actor: profile.email,
      description: `Agent API kulcs generálva (${data.key_prefix}…)`,
      api_key_id: data.id,
    });

    return { key, row: data };
  });

export const revokeAgentKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input || typeof input.id !== "string" || input.id.length === 0) {
      throw new Error("id szükséges");
    }
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const profile = await loadProfile(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("agent_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organization_id", profile.organization_id)
      .eq("id", data.id)
      .is("revoked_at", null)
      .select("key_prefix")
      .maybeSingle();
    if (error) throw error;
    if (row) {
      await supabaseAdmin.from("activity_log").insert({
        organization_id: profile.organization_id,
        actor: profile.email,
        description: `Agent API kulcs visszavonva (${row.key_prefix}…)`,
        api_key_id: data.id,
      });
    }
    return { ok: true };
  });

export const listBlocklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlocklistRow[]> => {
    const profile = await loadProfile(context, false);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_blocklist")
      .select("id, email, reason, source, created_at")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data ?? [];
  });

export const addToBlocklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; reason?: string }) => {
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) throw new Error("Érvénytelen email cím.");
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
    return { email, reason };
  })
  .handler(async ({ data, context }) => {
    const profile = await loadProfile(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("email_blocklist")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .ilike(
        "email",
        data.email.replace(/[\\%_]/g, (c) => `\\${c}`),
      )
      .limit(1);
    if ((existing ?? []).length > 0) return { ok: true, duplicate: true };

    const { error } = await supabaseAdmin.from("email_blocklist").insert({
      organization_id: profile.organization_id,
      email: data.email,
      reason: data.reason || null,
      source: "kezi",
    });
    if (error) throw error;
    return { ok: true, duplicate: false };
  });

export const removeFromBlocklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input || typeof input.id !== "string" || input.id.length === 0) {
      throw new Error("id szükséges");
    }
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const profile = await loadProfile(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("email_blocklist")
      .delete()
      .eq("organization_id", profile.organization_id)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
