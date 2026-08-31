import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { decryptRefreshToken } from "@/server/outlook-crypto.server";
import { classifyPendingResponses } from "@/server/response-classifier.server";

type GraphMessage = {
  id: string;
  conversationId?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  from?: { emailAddress?: { address?: string } };
};

export const Route = createFileRoute("/api/public/cron/inbox-poller")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orgs, error: orgsError } = await supabaseAdmin
          .from("settings")
          .select("organization_id")
          .eq("outlook_connected", true);
        if (orgsError) {
          return Response.json({ success: false, error: orgsError.message }, { status: 500 });
        }

        const results: Array<{
          organization_id: string;
          inserted: number;
          classified: number;
          note?: string;
        }> = [];

        for (const org of orgs ?? []) {
          const organizationId = org.organization_id;

          const { data: conn } = await supabaseAdmin
            .from("outlook_connections")
            .select("refresh_token_ciphertext, account_email")
            .eq("organization_id", organizationId)
            .maybeSingle();
          if (!conn) {
            results.push({ organization_id: organizationId, inserted: 0, classified: 0, note: "no_connection" });
            continue;
          }

          let accessToken: string | null = null;
          try {
            accessToken = await refreshAccessToken(decryptRefreshToken(conn.refresh_token_ciphertext));
          } catch (err) {
            console.error(`[inbox-poller] Token error for org ${organizationId}:`, err instanceof Error ? err.message : err);
          }
          if (!accessToken) {
            results.push({ organization_id: organizationId, inserted: 0, classified: 0, note: "token_refresh_failed" });
            continue;
          }

          const since = new Date(Date.now() - 7 * 86400000).toISOString();
          const messages = await fetchInbox(accessToken, since);
          if (!messages) {
            results.push({ organization_id: organizationId, inserted: 0, classified: 0, note: "graph_error" });
            continue;
          }

          // Sent outreach emails of this org (for conversation / contact matching)
          const { data: sentEmails } = await supabaseAdmin
            .from("emails_queue")
            .select("id, contact_id, conversation_id, sent_at")
            .eq("organization_id", organizationId)
            .eq("status", "elkuldot")
            .not("sent_at", "is", null)
            .order("sent_at", { ascending: false })
            .limit(500);

          const emails = sentEmails ?? [];
          if (emails.length === 0) {
            results.push({ organization_id: organizationId, inserted: 0, classified: 0 });
            continue;
          }

          const contactIds = Array.from(
            new Set(emails.map((e) => e.contact_id).filter((v): v is string => Boolean(v))),
          );
          const { data: contacts } = await supabaseAdmin
            .from("contacts")
            .select("id, email")
            .eq("organization_id", organizationId)
            .in("id", contactIds.length > 0 ? contactIds : ["00000000-0000-0000-0000-000000000000"]);

          const contactByEmail = new Map<string, string>();
          for (const c of contacts ?? []) {
            if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
          }

          const emailByConversation = new Map<string, string>();
          const latestEmailByContact = new Map<string, string>();
          for (const e of emails) {
            if (e.conversation_id && !emailByConversation.has(e.conversation_id)) {
              emailByConversation.set(e.conversation_id, e.id);
            }
            if (e.contact_id && !latestEmailByContact.has(e.contact_id)) {
              latestEmailByContact.set(e.contact_id, e.id);
            }
          }

          let inserted = 0;

          for (const message of messages) {
            const sender = message.from?.emailAddress?.address?.toLowerCase() ?? "";
            let emailId: string | null =
              (message.conversationId ? emailByConversation.get(message.conversationId) : undefined) ?? null;

            if (!emailId && sender) {
              const contactId = contactByEmail.get(sender);
              if (contactId) emailId = latestEmailByContact.get(contactId) ?? null;
            }
            if (!emailId) continue;

            // Skip if this Graph message was already stored
            const { data: existing } = await supabaseAdmin
              .from("responses")
              .select("id")
              .eq("organization_id", organizationId)
              .eq("graph_message_id", message.id)
              .maybeSingle();
            if (existing) continue;

            const rawText = htmlToText(message.body?.content ?? message.bodyPreview ?? "");

            const { error: insertError } = await supabaseAdmin.from("responses").insert({
              organization_id: organizationId,
              email_id: emailId,
              received_at: message.receivedDateTime ?? new Date().toISOString(),
              raw_text: rawText,
              graph_message_id: message.id,
              handled: false,
              seen: false,
            });
            if (insertError) {
              console.error(`[inbox-poller] Insert failed for message ${message.id}:`, insertError.message);
              continue;
            }

            // Remember the conversation for future replies in this thread
            if (message.conversationId) {
              await supabaseAdmin
                .from("emails_queue")
                .update({ conversation_id: message.conversationId })
                .eq("id", emailId)
                .is("conversation_id", null);
            }

            inserted++;
          }

          let classified = 0;
          try {
            const outcome = await classifyPendingResponses(organizationId);
            classified = outcome.processed;
          } catch (err) {
            console.error(
              `[inbox-poller] Classification run failed for org ${organizationId}:`,
              err instanceof Error ? err.message : err,
            );
          }

          results.push({ organization_id: organizationId, inserted, classified });
        }

        return Response.json({ success: true, results });
      },
    },
  },
});

async function fetchInbox(accessToken: string, since: string): Promise<GraphMessage[] | null> {
  const url =
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages" +
    "?$select=id,conversationId,receivedDateTime,bodyPreview,body,from" +
    `&$filter=receivedDateTime ge ${since}` +
    "&$orderby=receivedDateTime desc&$top=50";

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!response.ok) {
    console.error(`[inbox-poller] Graph error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return null;
  }
  const json = (await response.json()) as { value?: GraphMessage[] };
  return json.value ?? [];
}

function htmlToText(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000);
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env["MICROSOFT_CLIENT_ID"];
  const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
  const tenantId = process.env["MICROSOFT_TENANT_ID"] ?? "common";
  if (!clientId || !clientSecret) return null;

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "Mail.Send Mail.Read offline_access",
    }),
  });

  const data = (await response.json()) as { access_token?: string };
  if (!response.ok || !data.access_token) return null;
  return data.access_token;
}
