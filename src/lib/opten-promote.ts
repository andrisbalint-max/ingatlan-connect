import { supabase } from "@/integrations/supabase/client";
import { pickDecisionMaker, type FoundPerson } from "@/lib/decision-maker";
import type { HunterSearchResult } from "@/lib/hunter.functions";

export interface ProspectRow {
  id: string;
  organization_id: string;
  company_name: string;
  teaor_code: string | null;
  teaor_description: string | null;
  activity_category: string | null;
  net_revenue_band: string | null;
  city: string | null;
  domain: string | null;
  /** 'opten_excel' | 'ai_web_search' | 'kezi' */
  domain_source: string | null;
  hunter_status: string;
  found_contacts: FoundPerson[] | null;
  decision_maker_name: string | null;
  decision_maker_email: string | null;
  decision_maker_position: string | null;
  decision_maker_match_confidence: string | null;
  promoted_to_crm: boolean;
  company_id: string | null;
  created_at: string;
}

export const HUNTER_STATUS_LABELS: Record<string, string> = {
  nincs_inditva: "Hunter: nincs indítva",
  folyamatban: "Hunter: folyamatban",
  talalat: "Hunter: találat",
  nincs_talalat: "Hunter: nincs találat",
  nincs_domain: "Nincs domain",
};

export const HUNTER_STATUS_STYLES: Record<string, string> = {
  nincs_inditva: "bg-muted text-muted-foreground",
  folyamatban: "bg-amber-100 text-amber-700",
  talalat: "bg-primary/10 text-primary",
  nincs_talalat: "bg-muted text-muted-foreground",
  nincs_domain: "bg-muted text-muted-foreground",
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  javasolt: "Javasolt",
  jovahagyva: "Jóváhagyva",
  elvetve: "Elvetve",
};

export const MATCH_STATUS_STYLES: Record<string, string> = {
  javasolt: "bg-amber-100 text-amber-700",
  jovahagyva: "bg-primary/10 text-primary",
  elvetve: "bg-muted text-muted-foreground",
};

export const UNCATEGORIZED_LABEL = "Egyéb / nincs kategorizálva";

function cleanDomain(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

type HunterRunner = (args: { data: { domain: string } }) => Promise<HunterSearchResult>;

/**
 * Runs the Hunter domain search for one prospect and applies the decision-maker
 * heuristic. A manual decision-maker override is preserved unless `force` is set.
 */
export async function runHunterForProspect(
  prospect: Pick<ProspectRow, "id" | "domain" | "decision_maker_email">,
  runHunter: HunterRunner,
  options: { keepManualPick?: boolean } = {},
): Promise<{ status: string; people: FoundPerson[] }> {
  const domain = cleanDomain(prospect.domain);
  if (!domain) {
    await supabase
      .from("opten_prospects")
      .update({ hunter_status: "nincs_domain" })
      .eq("id", prospect.id);
    return { status: "nincs_domain", people: [] };
  }

  await supabase
    .from("opten_prospects")
    .update({ hunter_status: "folyamatban" })
    .eq("id", prospect.id);

  let result: HunterSearchResult;
  try {
    result = await runHunter({ data: { domain } });
  } catch (err) {
    await supabase
      .from("opten_prospects")
      .update({ hunter_status: "nincs_inditva" })
      .eq("id", prospect.id);
    throw err;
  }

  if (result.status === "no_api_key") {
    await supabase
      .from("opten_prospects")
      .update({ hunter_status: "nincs_inditva" })
      .eq("id", prospect.id);
    throw new Error(result.message ?? "Nincs Hunter API kulcs.");
  }

  const people: FoundPerson[] = result.status === "ok" ? result.people : [];
  const status = people.length > 0 ? "talalat" : "nincs_talalat";

  const keepManual = options.keepManualPick && Boolean(prospect.decision_maker_email);
  const pick = pickDecisionMaker(people);

  const update = keepManual
    ? { hunter_status: status, found_contacts: people as never }
    : {
        hunter_status: status,
        found_contacts: people as never,
        decision_maker_name: pick.name,
        decision_maker_email: pick.email,
        decision_maker_position: pick.position,
        decision_maker_match_confidence: pick.confidence,
      };

  const { error } = await supabase.from("opten_prospects").update(update).eq("id", prospect.id);
  if (error) throw error;

  return { status, people };
}

/**
 * Promotes an organization-wide prospect into the CRM for a given project:
 * reuses (or creates) a companies row, links it as an approved project_companies
 * row (source='opten'), and creates the decision-maker as the primary contact
 * plus any other people Hunter found.
 */
export async function promoteProspectToCrm(prospect: ProspectRow, projectId: string) {
  const domain = cleanDomain(prospect.domain);

  let companyId: string | null = prospect.company_id ?? null;

  if (!companyId && domain) {
    const { data: byDomain } = await supabase
      .from("companies")
      .select("id")
      .ilike("domain", `%${domain}%`)
      .limit(1);
    companyId = byDomain?.[0]?.id ?? null;
  }

  if (!companyId) {
    const { data: byName } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", prospect.company_name)
      .limit(1);
    companyId = byName?.[0]?.id ?? null;
  }

  if (!companyId) {
    const { data: created, error: createError } = await supabase
      .from("companies")
      .insert({
        organization_id: prospect.organization_id,
        name: prospect.company_name,
        domain: domain || null,
        city: prospect.city,
        industry: prospect.activity_category ?? prospect.teaor_description,
        notes: prospect.teaor_code ? `TEÁOR: ${prospect.teaor_code}` : null,
      })
      .select("id")
      .single();
    if (createError) throw createError;
    companyId = created.id;
  }

  const criteria = [prospect.activity_category, prospect.net_revenue_band]
    .filter(Boolean)
    .join(" · ");

  const { error: linkError } = await supabase.from("project_companies").upsert(
    {
      organization_id: prospect.organization_id,
      project_id: projectId,
      company_id: companyId,
      source: "opten",
      status: "jovahagyva",
      match_reason: criteria ? `Opten import: ${criteria}` : "Opten import",
    },
    { onConflict: "project_id,company_id" },
  );
  if (linkError) throw linkError;

  // decision-maker first, then the rest of Hunter's people
  const staged: FoundPerson[] = [];
  if (prospect.decision_maker_email) {
    staged.push({
      name: prospect.decision_maker_name,
      email: prospect.decision_maker_email,
      position: prospect.decision_maker_position,
    });
  }
  (prospect.found_contacts ?? []).forEach((person) => {
    if (!person?.email) return;
    if (person.email.toLowerCase() === (prospect.decision_maker_email ?? "").toLowerCase()) return;
    staged.push(person);
  });

  let savedContacts = 0;
  if (staged.length > 0) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("email")
      .eq("company_id", companyId);
    const known = new Set(
      (existing ?? []).map((row) => (row.email ?? "").toLowerCase()).filter(Boolean),
    );
    const rows = staged
      .filter((person) => {
        const email = (person.email ?? "").toLowerCase();
        if (!email || known.has(email)) return false;
        known.add(email);
        return true;
      })
      .slice(0, 6)
      .map((person) => ({
        organization_id: prospect.organization_id,
        company_id: companyId as string,
        name: person.name?.trim() || (person.email as string),
        email: person.email as string,
        position: person.position ?? null,
      }));
    if (rows.length > 0) {
      const { error: contactError } = await supabase.from("contacts").insert(rows);
      if (contactError) throw contactError;
      savedContacts = rows.length;
      await supabase.from("companies").update({ hunter_searched: true }).eq("id", companyId);
    }
  }

  const { error: updateError } = await supabase
    .from("opten_prospects")
    .update({ promoted_to_crm: true, company_id: companyId })
    .eq("id", prospect.id);
  if (updateError) throw updateError;

  return { companyId, savedContacts };
}
