import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

type EmailRow = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  subject: string | null;
  context_note: string | null;
  follow_up_number: number;
  sent_at: string | null;
};

export const Route = createFileRoute("/api/public/cron/follow-up-generator")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: orgs, error: orgsError } = await supabaseAdmin
          .from("settings")
          .select("organization_id, openai_api_key, follow_up_schedule");
        if (orgsError) {
          return Response.json({ success: false, error: orgsError.message }, { status: 500 });
        }

        const results: Array<{ organization_id: string; created: number; skipped?: string }> = [];

        for (const org of orgs ?? []) {
          const apiKey = (org.openai_api_key ?? "").trim();
          if (!apiKey) {
            console.log(
              `[follow-up-generator] Skipping organization ${org.organization_id}: openai_api_key is not set.`,
            );
            results.push({ organization_id: org.organization_id, created: 0, skipped: "no_openai_api_key" });
            continue;
          }

          const steps = parseSchedule(org.follow_up_schedule);
          if (steps.length === 0) {
            results.push({ organization_id: org.organization_id, created: 0, skipped: "empty_schedule" });
            continue;
          }

          // Eligible companies: no response yet and not opted out
          const { data: companies, error: companiesError } = await supabaseAdmin
            .from("companies")
            .select("id, name, follow_up_paused_until")
            .eq("organization_id", org.organization_id)
            .eq("opt_out", false)
            .eq("status", "nincs_valasz")
            .or(`follow_up_paused_until.is.null,follow_up_paused_until.lte.${new Date().toISOString()}`);
          if (companiesError) {
            return Response.json({ success: false, error: companiesError.message }, { status: 500 });
          }
          if (!companies || companies.length === 0) {
            results.push({ organization_id: org.organization_id, created: 0 });
            continue;
          }

          let created = 0;

          for (const company of companies) {
            const { data: emails, error: emailsError } = await supabaseAdmin
              .from("emails_queue")
              .select("id, company_id, contact_id, subject, context_note, follow_up_number, sent_at")
              .eq("organization_id", org.organization_id)
              .eq("company_id", company.id)
              .order("created_at", { ascending: false });
            if (emailsError) {
              return Response.json({ success: false, error: emailsError.message }, { status: 500 });
            }

            const all = (emails ?? []) as EmailRow[];
            const sent = all
              .filter((e) => e.sent_at)
              .sort((a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime());
            const last = sent[0];
            if (!last) continue;

            const daysSince = daysBetween(new Date(last.sent_at!), new Date());
            if (!steps.includes(daysSince)) continue;

            const nextNumber = (last.follow_up_number ?? 0) + 1;
            const alreadyExists = all.some((e) => e.follow_up_number === nextNumber);
            if (alreadyExists) continue;

            const stepIndex = steps.indexOf(daysSince);
            const contextNote = `${nextNumber + 1}. emlékeztető — nincs válasz ${daysSince} napja`;

            let draft: { subject: string; body: string } | null = null;
            try {
              draft = await generateFollowUp({
                apiKey,
                companyName: company.name,
                previousContext: last.context_note,
                previousSubject: last.subject,
                daysSince,
                stepNumber: stepIndex + 1,
              });
            } catch (err) {
              console.error(
                `[follow-up-generator] OpenAI draft failed for company ${company.id}:`,
                err instanceof Error ? err.message : err,
              );
              continue;
            }
            if (!draft) continue;

            const { error: insertError } = await supabaseAdmin.from("emails_queue").insert({
              organization_id: org.organization_id,
              company_id: company.id,
              contact_id: last.contact_id,
              subject: draft.subject,
              body: draft.body,
              ai_generated: true,
              status: "varakozik",
              follow_up_number: nextNumber,
              context_note: contextNote,
            });
            if (insertError) {
              console.error(`[follow-up-generator] Insert failed for company ${company.id}:`, insertError.message);
              continue;
            }
            created++;
          }

          results.push({ organization_id: org.organization_id, created });
        }

        return Response.json({ success: true, results });
      },
    },
  },
});

function parseSchedule(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : [4, 10, 21];
  return raw
    .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
    .filter((v) => Number.isFinite(v) && v > 0);
}

function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86400000);
}

async function generateFollowUp(input: {
  apiKey: string;
  companyName: string;
  previousContext: string | null;
  previousSubject: string | null;
  daysSince: number;
  stepNumber: number;
}): Promise<{ subject: string; body: string }> {
  const prompt = [
    `Cég neve: ${input.companyName}`,
    `Korábbi megkeresés tárgya: ${input.previousSubject ?? "(nincs adat)"}`,
    `Miért őt kerestük: ${input.previousContext ?? "(nincs adat)"}`,
    `Az előző email ${input.daysSince} napja ment ki, válasz nem érkezett.`,
    `Ez a ${input.stepNumber}. emlékeztető.`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Ipari ingatlan bérbeadással foglalkozó magyar B2B bróker asszisztense vagy. Írj rövid (max. 120 szó), udvarias, magyar nyelvű emlékeztető emailt, ami utal a korábbi megkeresésre, nem tolakodó, és egy egyszerű kérdéssel zárul. Válaszolj kizárólag JSON-ben: {\"subject\": string, \"body\": string}. A body sima szöveg, aláírás nélkül.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as { subject?: string; body?: string };
  if (!parsed.subject || !parsed.body) throw new Error("OpenAI response missing subject/body");
  return { subject: parsed.subject, body: parsed.body };
}
