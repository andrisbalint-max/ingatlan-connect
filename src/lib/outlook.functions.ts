import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signState } from "@/server/outlook-crypto.server";

export interface OutlookStatus {
  connected: boolean;
  accountEmail: string | null;
}

export const startOutlookAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env["MICROSOFT_CLIENT_ID"];
    const tenantId = process.env["MICROSOFT_TENANT_ID"] ?? "common";
    if (!clientId) throw new Error("MICROSOFT_CLIENT_ID is not configured.");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Profile not found.");
    if (profile.role !== "admin") throw new Error("Only admins can connect Outlook.");

    const state = signState(profile.organization_id);
    const redirectUri = `${process.env["APP_PUBLIC_URL"] ?? ""}/api/public/auth/microsoft/callback`;
    const scope = encodeURIComponent("Mail.Send Mail.Read offline_access");
    const authUrl =
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_mode=query`;

    return { authUrl };
  });

export const getOutlookStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OutlookStatus> => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return { connected: false, accountEmail: null };

    const { data: settings, error: settingsError } = await context.supabase
      .from("settings")
      .select("outlook_connected")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    if (!settings?.outlook_connected) {
      return { connected: false, accountEmail: null };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error: connError } = await supabaseAdmin
      .from("outlook_connections")
      .select("account_email")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (connError) throw connError;

    return { connected: true, accountEmail: conn?.account_email ?? null };
  });

export const disconnectOutlook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Profile not found.");
    if (profile.role !== "admin") throw new Error("Only admins can disconnect Outlook.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: deleteError } = await supabaseAdmin
      .from("outlook_connections")
      .delete()
      .eq("organization_id", profile.organization_id);
    if (deleteError) throw deleteError;

    const { error: updateError } = await context.supabase
      .from("settings")
      .update({ outlook_connected: false })
      .eq("organization_id", profile.organization_id);
    if (updateError) throw updateError;

    return { ok: true };
  });

export const setupEmailCronJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("role")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "admin") throw new Error("Only admins can set up cron jobs.");

    const cronSecret = process.env["LOVABLE_CRON_SECRET"];
    if (!cronSecret) throw new Error("LOVABLE_CRON_SECRET is not configured.");

    const publicUrl = process.env["APP_PUBLIC_URL"];
    if (!publicUrl) throw new Error("APP_PUBLIC_URL is not configured.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const schedules = [
      {
        name: "email-scheduler-every-5-min",
        schedule: "*/5 * * * *",
        url: `${publicUrl}/api/public/cron/email-scheduler`,
      },
      {
        name: "email-sender-every-5-min",
        schedule: "*/5 * * * *",
        url: `${publicUrl}/api/public/cron/email-sender`,
      },
    ];

    for (const job of schedules) {
      await supabaseAdmin.rpc("cron_unschedule", { job_name: job.name });
      const { error } = await supabaseAdmin.rpc("cron_schedule", {
        job_name: job.name,
        schedule: job.schedule,
        command: `
          select net.http_post(
            url:='${job.url}',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer ${cronSecret}"}'::jsonb,
            body:='{}'::jsonb
          ) as request_id;
        `,
      });
      if (error) throw error;
    }

    return { ok: true };
  });

