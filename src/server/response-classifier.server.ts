type Category = "erdeklodes" | "talalkozo" | "elutasitas" | "kerdes" | "autovalasz";

const CATEGORIES: Category[] = ["erdeklodes", "talalkozo", "elutasitas", "kerdes", "autovalasz"];

/**
 * Classifies every unhandled response of an organization with the org's OpenAI key
 * and applies the automatic company-level actions. Organizations without an
 * OpenAI key are skipped silently (logged only).
 */
export async function classifyPendingResponses(organizationId: string): Promise<{
  processed: number;
  skipped?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("openai_api_key")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const apiKey = (settings?.openai_api_key ?? "").trim();
  if (!apiKey) {
    console.log(
      `[response-classifier] Skipping organization ${organizationId}: openai_api_key is not set.`,
    );
    return { processed: 0, skipped: "no_openai_api_key" };
  }

  const { data: pending, error } = await supabaseAdmin
    .from("responses")
    .select("id, email_id, raw_text")
    .eq("organization_id", organizationId)
    .eq("handled", false)
    .order("received_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(error.message);

  let processed = 0;

  for (const row of pending ?? []) {
    const text = (row.raw_text ?? "").trim();
    if (!text) continue;

    let category: Category | null = null;
    try {
      category = await classify(apiKey, text);
    } catch (err) {
      console.error(
        `[response-classifier] Classification failed for response ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (!category) continue;

    // Resolve the related company through the original outreach email
    let companyId: string | null = null;
    if (row.email_id) {
      const { data: email } = await supabaseAdmin
        .from("emails_queue")
        .select("company_id")
        .eq("id", row.email_id)
        .maybeSingle();
      companyId = email?.company_id ?? null;
    }

    if (companyId) {
      if (category === "erdeklodes" || category === "talalkozo") {
        await supabaseAdmin
          .from("companies")
          .update({ status: "valaszolt", follow_up_paused_until: null })
          .eq("id", companyId);
      } else if (category === "elutasitas") {
        await supabaseAdmin
          .from("companies")
          .update({ status: "lezarva", opt_out: true })
          .eq("id", companyId);
      } else if (category === "autovalasz") {
        const returnDate = parseReturnDate(text);
        if (returnDate) {
          await supabaseAdmin
            .from("companies")
            .update({ follow_up_paused_until: returnDate.toISOString() })
            .eq("id", companyId);
        }
      }
    }

    await supabaseAdmin
      .from("responses")
      .update({ category, handled: true })
      .eq("id", row.id);

    processed++;
  }

  return { processed };
}

async function classify(apiKey: string, text: string): Promise<Category | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Magyar B2B ipari ingatlan brókercég email-válaszait osztályozod. Kategóriák: "erdeklodes" (érdeklődik, kéri az ajánlatot), "talalkozo" (találkozót, hívást, egyeztetést kér), "elutasitas" (nem érdekli, kéri hogy ne keressék), "kerdes" (konkrét kérdést tesz fel, még nem érdeklődés), "autovalasz" (automatikus/szabadság/házon kívül válasz). Válaszolj kizárólag JSON-ben: {"category": "..."}',
        },
        { role: "user", content: text.slice(0, 4000) },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as { category?: string };
  const category = parsed.category as Category | undefined;
  return category && CATEGORIES.includes(category) ? category : null;
}

const HU_MONTHS: Record<string, number> = {
  január: 1, februar: 2, február: 2, marcius: 3, március: 3, aprilis: 4, április: 4,
  majus: 5, május: 5, junius: 6, június: 6, julius: 7, július: 7, augusztus: 8,
  szeptember: 9, oktober: 10, október: 10, november: 11, december: 12, januar: 1,
};

/** Best-effort extraction of a return date from an out-of-office message. */
export function parseReturnDate(text: string, now: Date = new Date()): Date | null {
  const lower = text.toLowerCase();

  // 2026.09.14 / 2026-09-14 / 2026/09/14
  const iso = /(20\d{2})[.\-/\s]{1,2}(\d{1,2})[.\-/\s]{1,2}(\d{1,2})/.exec(lower);
  if (iso) {
    const d = buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (d) return d;
  }

  // 09.14 / 09. 14. (current or next year)
  const short = /(?<!\d)(\d{1,2})[.\-/]\s?(\d{1,2})\.?(?!\d)/.exec(lower);

  // "szeptember 14" / "szept. 14."
  const named = new RegExp(`(${Object.keys(HU_MONTHS).join("|")})\\s*(\\d{1,2})`).exec(lower);
  if (named) {
    const month = HU_MONTHS[named[1] as string];
    const day = Number(named[2]);
    const candidate = buildDate(now.getUTCFullYear(), month ?? 0, day);
    if (candidate) return candidate < now ? buildDate(now.getUTCFullYear() + 1, month ?? 0, day) : candidate;
  }

  if (short) {
    const month = Number(short[1]);
    const day = Number(short[2]);
    const candidate = buildDate(now.getUTCFullYear(), month, day);
    if (candidate) return candidate < now ? buildDate(now.getUTCFullYear() + 1, month, day) : candidate;
  }

  return null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 23, 59, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}
