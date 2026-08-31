import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { decryptRefreshToken } from "@/server/outlook-crypto.server";

export const Route = createFileRoute("/api/public/cron/email-sender")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error: rowsError } = await supabaseAdmin
          .from("emails_queue")
          .select(
            "id, organization_id, contact_id, subject, body, scheduled_for, send_attempts",
          )
          .eq("status", "jovahagyva")
          .lte("scheduled_for", new Date().toISOString())
          .is("sent_at", null)
          .order("scheduled_for", { ascending: true })
          .limit(50);
        if (rowsError) {
          return Response.json({ success: false, error: rowsError.message }, { status: 500 });
        }

        const results: Array<{ id: string; status: "sent" | "failed"; error?: string }> = [];

        for (const row of rows ?? []) {
          const { data: conn, error: connError } = await supabaseAdmin
            .from("outlook_connections")
            .select("refresh_token_ciphertext, account_email")
            .eq("organization_id", row.organization_id)
            .maybeSingle();
          if (connError || !conn) {
            await markFailed(row.id, row.send_attempts, connError?.message ?? "Outlook connection not found.");
            results.push({ id: row.id, status: "failed", error: connError?.message ?? "Outlook connection not found." });
            continue;
          }

          const { data: contact, error: contactError } = await supabaseAdmin
            .from("contacts")
            .select("email, name")
            .eq("id", row.contact_id ?? "")
            .maybeSingle();
          if (contactError || !contact?.email) {
            await markFailed(row.id, row.send_attempts, contactError?.message ?? "Contact email not found.");
            results.push({ id: row.id, status: "failed", error: contactError?.message ?? "Contact email not found." });
            continue;
          }

          const refreshToken = decryptRefreshToken(conn.refresh_token_ciphertext);
          const accessToken = await refreshAccessToken(refreshToken);
          if (!accessToken) {
            await invalidateConnection(row.organization_id);
            await markFailed(row.id, row.send_attempts, "Failed to refresh Microsoft access token.");
            results.push({ id: row.id, status: "failed", error: "Failed to refresh Microsoft access token." });
            continue;
          }


          const sendResult = await sendEmail(
            accessToken,
            contact.email,
            contact.name ?? contact.email,
            row.subject ?? "",
            row.body ?? "",
          );

          if (sendResult.ok) {
            const { error: updateError } = await supabaseAdmin
              .from("emails_queue")
              .update({
                status: "elkuldot",
                sent_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", row.id);
            if (updateError) {
              results.push({ id: row.id, status: "failed", error: updateError.message });
            } else {
              results.push({ id: row.id, status: "sent" });
            }
          } else {
            if (sendResult.invalidateConnection) {
              await invalidateConnection(row.organization_id);
            }
            const errorMessage = sendResult.error ?? "Unknown send error.";
            await markFailed(row.id, row.send_attempts, errorMessage);
            results.push({ id: row.id, status: "failed", error: errorMessage });

          }

        }

        return Response.json({ success: true, processed: results.length, results });
      },
    },
  },
});

async function markFailed(emailId: string, attempts: number, error: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("emails_queue")
    .update({
      send_attempts: attempts + 1,
      last_error: error.slice(0, 500),
    })
    .eq("id", emailId);
}


async function invalidateConnection(organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("outlook_connections").delete().eq("organization_id", organizationId);
  await supabaseAdmin
    .from("settings")
    .update({ outlook_connected: false })
    .eq("organization_id", organizationId);
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env["MICROSOFT_CLIENT_ID"];
  const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
  const tenantId = process.env["MICROSOFT_TENANT_ID"] ?? "common";
  if (!clientId || !clientSecret) return null;

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "Mail.Send Mail.Read offline_access",
      }),
    },
  );

  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) return null;
  return data.access_token;
}

async function sendEmail(
  accessToken: string,
  toEmail: string,
  toName: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; error?: string; invalidateConnection?: boolean }> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: body },
        toRecipients: [{ emailAddress: { address: toEmail, name: toName } }],
      },
      saveToSentItems: true,
    }),
  });

  if (response.ok) {
    return { ok: true };
  }

  const text = await response.text();
  const invalidate =
    response.status === 401 ||
    text.includes("InvalidAuthenticationToken") ||
    text.includes("AADSTS700082") ||
    text.includes("AADSTS700084") ||
    text.includes("AADSTS50076");

  return { ok: false, error: `Graph API ${response.status}: ${text.slice(0, 200)}`, invalidateConnection: invalidate };
}
