import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiCallStatus = "ok" | "no_provider" | "out_of_credit" | "error";

export interface MatchResult {
  status: AiCallStatus;
  message?: string | undefined;
  created: number;
}

export interface OutreachResult {
  status: AiCallStatus;
  message?: string | undefined;
  subject?: string | undefined;
}

const MATCH_SYSTEM_PROMPT =
  "Ipari ingatlan B2B bróker asszisztens vagy. A feladatod, hogy a megadott projekthez a MEGADOTT céglistából válaszd ki a legrelevánsabb cégeket. Soha ne találj ki céget, csak a listában szereplő id-ket használd. Válaszod KIZÁRÓLAG egy JSON tömb legyen ebben a formában: [{\"company_id\":\"...\",\"match_reason\":\"rövid magyar indoklás (max 1 mondat)\"}]. Legfeljebb 10 céget adj vissza, relevancia szerint rendezve. Ha egyik cég sem illik, adj vissza üres tömböt.";

const OUTREACH_SYSTEM_PROMPT =
  "Ipari ingatlan B2B bróker asszisztens vagy. Rövid, tárgyilagos, magyar nyelvű első megkereső emailt írsz egy konkrét ipari ingatlan projektről. Legyen tegező-nélküli, professzionális (Ön-forma), max 130 szó, konkrét, nem nyálas. Válaszod KIZÁRÓLAG JSON: {\"subject\":\"...\",\"body\":\"...\"}.";

function parseJsonBlock(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error("Az AI válasza nem értelmezhető.");
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * "project-company-matcher": ranks the organization's EXISTING companies against
 * the project's description + target audience and stores the shortlist in
 * project_companies (source='ai_suggested', status='javasolt').
 */
export const matchProjectCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => {
    if (!input?.projectId) throw new Error("projectId szükséges");
    return { projectId: input.projectId };
  })
  .handler(async ({ data, context }): Promise<MatchResult> => {
    const { supabase } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, title, description, city, size_sqm, target_audience")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return { status: "error", message: "A projekt nem található.", created: 0 };

    const { resolveAiProvider, generateText, isAiOutOfCreditError } = await import(
      "@/server/ai-provider.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("openai_api_key, anthropic_api_key, preferred_ai_provider, ai_provider_out_of_credit")
      .eq("organization_id", project.organization_id)
      .maybeSingle();

    const resolved = resolveAiProvider(settings);
    if (!resolved) {
      return { status: "no_provider", message: "AI-szolgáltató nincs beállítva", created: 0 };
    }

    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, industry, city, notes")
      .eq("opt_out", false)
      .limit(200);
    if (companiesError) throw companiesError;
    if (!companies || companies.length === 0) {
      return {
        status: "ok",
        message: "Még nincs cég a CRM-ben, amit párosítani lehetne.",
        created: 0,
      };
    }

    const { data: existing } = await supabase
      .from("project_companies")
      .select("company_id")
      .eq("project_id", project.id);
    const alreadyLinked = new Set((existing ?? []).map((row) => row.company_id));

    const candidates = companies.filter((c) => !alreadyLinked.has(c.id));
    if (candidates.length === 0) {
      return { status: "ok", message: "Minden cég már hozzá van rendelve a projekthez.", created: 0 };
    }

    const userPrompt = [
      `Projekt: ${project.title}`,
      project.city ? `Város: ${project.city}` : null,
      project.size_sqm ? `Méret: ${project.size_sqm} m²` : null,
      project.description ? `Leírás: ${project.description}` : null,
      project.target_audience ? `Célközönség: ${project.target_audience}` : null,
      "",
      "Elérhető cégek:",
      ...candidates.map(
        (c) =>
          `- id: ${c.id} | név: ${c.name} | iparág: ${c.industry ?? "—"} | város: ${c.city ?? "—"} | jegyzet: ${(c.notes ?? "—").slice(0, 200)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    let text: string;
    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: MATCH_SYSTEM_PROMPT,
        userPrompt,
        organizationId: project.organization_id,
        maxTokens: 1500,
      });
      text = result.text;
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return {
          status: "out_of_credit",
          message: "Elfogyott az AI-kredit, próbáld később",
          created: 0,
        };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
        created: 0,
      };
    }

    let parsed: Array<{ company_id?: string; match_reason?: string }>;
    try {
      const json = parseJsonBlock(text);
      parsed = Array.isArray(json) ? json : [];
    } catch {
      return { status: "error", message: "Az AI válasza nem értelmezhető.", created: 0 };
    }

    const validIds = new Set(candidates.map((c) => c.id));
    const rows = parsed
      .filter((row) => row.company_id && validIds.has(row.company_id))
      .slice(0, 10)
      .map((row) => ({
        organization_id: project.organization_id,
        project_id: project.id,
        company_id: row.company_id as string,
        match_reason: row.match_reason ?? null,
        source: "ai_suggested",
        status: "javasolt",
      }));

    if (rows.length === 0) {
      return {
        status: "ok",
        message: "Az AI nem talált elég releváns céget a jelenlegi CRM-adatokból.",
        created: 0,
      };
    }

    const { error: insertError } = await supabase.from("project_companies").insert(rows);
    if (insertError) throw insertError;

    return { status: "ok", created: rows.length };
  });

/**
 * "project-outreach-generator": drafts an initial outreach email for a
 * company/contact in the context of this project and queues it in emails_queue.
 * If the company is already linked to another project, the prompt is instructed
 * to take a clearly different angle so nobody gets two near-identical emails.
 */
export const generateProjectOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; companyId: string }) => {
    if (!input?.projectId || !input?.companyId) throw new Error("projectId és companyId szükséges");
    return { projectId: input.projectId, companyId: input.companyId };
  })
  .handler(async ({ data, context }): Promise<OutreachResult> => {
    const { supabase } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, title, description, city, size_sqm, target_audience")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return { status: "error", message: "A projekt nem található." };

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, industry, city, notes")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) return { status: "error", message: "A cég nem található." };

    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email, position")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });
    const contact = (contacts ?? []).find((c) => c.email) ?? null;

    const { resolveAiProvider, generateText, isAiOutOfCreditError } = await import(
      "@/server/ai-provider.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("openai_api_key, anthropic_api_key, preferred_ai_provider")
      .eq("organization_id", project.organization_id)
      .maybeSingle();

    const resolved = resolveAiProvider(settings);
    if (!resolved) return { status: "no_provider", message: "AI-szolgáltató nincs beállítva" };

    // Other projects this company is already linked to (informs the angle)
    const { data: otherLinks } = await supabase
      .from("project_companies")
      .select("project_id, projects(title)")
      .eq("company_id", company.id)
      .neq("project_id", project.id)
      .neq("status", "elvetve");

    const otherProjectTitles = (otherLinks ?? [])
      .map((row) => (row as { projects?: { title?: string } | null }).projects?.title)
      .filter((t): t is string => Boolean(t));

    let previousExcerpt = "";
    if ((otherLinks ?? []).length > 0) {
      const { data: previousEmails } = await supabase
        .from("emails_queue")
        .select("subject, body, project_id")
        .eq("company_id", company.id)
        .neq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const previous = previousEmails?.[0];
      if (previous) {
        previousExcerpt = `${previous.subject ?? ""}\n${(previous.body ?? "").slice(0, 400)}`;
      }
    }

    const userPrompt = [
      `Projekt: ${project.title}`,
      project.city ? `Város: ${project.city}` : null,
      project.size_sqm ? `Méret: ${project.size_sqm} m²` : null,
      project.description ? `Projekt leírás: ${project.description}` : null,
      project.target_audience ? `Célközönség: ${project.target_audience}` : null,
      "",
      `Címzett cég: ${company.name} (iparág: ${company.industry ?? "—"}, város: ${company.city ?? "—"})`,
      contact ? `Kapcsolattartó: ${contact.name}${contact.position ? `, ${contact.position}` : ""}` : "Nincs név szerinti kapcsolattartó, általános megszólítást használj.",
      otherProjectTitles.length > 0
        ? `FIGYELEM: ennek a cégnek már küldtünk/küldünk megkeresést más projektről is (${otherProjectTitles.join(", ")}). Írj érezhetően más szögből, más megfogalmazással, és tegyél világossá, hogy EZ az email konkrétan a "${project.title}" projektről szól.`
        : null,
      previousExcerpt ? `A korábbi email részlete (ne hasonlíts rá):\n${previousExcerpt}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    let text: string;
    try {
      const result = await generateText({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        systemPrompt: OUTREACH_SYSTEM_PROMPT,
        userPrompt,
        organizationId: project.organization_id,
        maxTokens: 900,
      });
      text = result.text;
    } catch (err) {
      if (isAiOutOfCreditError(err)) {
        return { status: "out_of_credit", message: "Elfogyott az AI-kredit, próbáld később" };
      }
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Az AI hívás nem sikerült.",
      };
    }

    let draft: { subject?: string; body?: string };
    try {
      draft = parseJsonBlock(text) as { subject?: string; body?: string };
    } catch {
      draft = { subject: `${project.title} — ipari ingatlan lehetőség`, body: text };
    }

    const { error: insertError } = await supabase.from("emails_queue").insert({
      organization_id: project.organization_id,
      company_id: company.id,
      contact_id: contact?.id ?? null,
      project_id: project.id,
      subject: draft.subject ?? `${project.title} — ipari ingatlan lehetőség`,
      body: draft.body ?? text,
      status: "varakozik",
      ai_generated: true,
      context_note: project.title,
    });
    if (insertError) throw insertError;

    return { status: "ok", subject: draft.subject };
  });
