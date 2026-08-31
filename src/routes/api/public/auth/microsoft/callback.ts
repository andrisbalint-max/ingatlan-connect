import { createFileRoute } from "@tanstack/react-router";
import { verifyState, encryptRefreshToken } from "@/server/outlook-crypto.server";

export const Route = createFileRoute("/api/public/auth/microsoft/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          return new Response(`Microsoft OAuth error: ${error} — ${errorDescription ?? ""}`, {
            status: 400,
          });
        }
        if (!code || !state) {
          return new Response("Missing code or state.", { status: 400 });
        }

        const organizationId = verifyState(state);
        if (!organizationId) {
          return new Response("Invalid or expired state.", { status: 400 });
        }

        const clientId = process.env["MICROSOFT_CLIENT_ID"];
        const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
        const tenantId = process.env["MICROSOFT_TENANT_ID"] ?? "common";
        if (!clientId || !clientSecret) {
          return new Response("Microsoft credentials are not configured.", { status: 500 });
        }

        const redirectUri = `${process.env["APP_PUBLIC_URL"] ?? ""}/api/public/auth/microsoft/callback`;

        const tokenResponse = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          },
        );

        const tokenData = (await tokenResponse.json()) as {
          refresh_token?: string;
          access_token?: string;
          error?: string;
          error_description?: string;
        };

        if (!tokenResponse.ok || !tokenData.refresh_token) {
          return new Response(
            `Token exchange failed: ${tokenData.error ?? tokenResponse.statusText} — ${tokenData.error_description ?? ""}`,
            { status: 400 },
          );
        }

        const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = (await profileResponse.json()) as { mail?: string; userPrincipalName?: string };
        const accountEmail = profile.mail ?? profile.userPrincipalName ?? "Ismeretlen";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: upsertError } = await supabaseAdmin.from("outlook_connections").upsert(
          {
            organization_id: organizationId,
            account_email: accountEmail,
            refresh_token_ciphertext: encryptRefreshToken(tokenData.refresh_token),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id" },
        );
        if (upsertError) {
          return new Response(`Failed to save connection: ${upsertError.message}`, { status: 500 });
        }

        const { error: settingsError } = await supabaseAdmin
          .from("settings")
          .update({ outlook_connected: true })
          .eq("organization_id", organizationId);
        if (settingsError) {
          return new Response(`Failed to update settings: ${settingsError.message}`, { status: 500 });
        }

        return new Response(
          `<html><body><script>window.opener.postMessage({type:'microsoftOutlookConnected'}, '*');window.close();</script><p>Sikeres kapcsolódás. Bezárhatod ezt az ablakot.</p></body></html>`,
          { headers: { "Content-Type": "text/html" } },
        );
      },
    },
  },
});
