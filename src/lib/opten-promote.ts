import { supabase } from "@/integrations/supabase/client";

export interface ProspectContact {
  name?: string | null;
  email?: string | null;
  position?: string | null;
}

export interface ProspectRow {
  id: string;
  organization_id: string;
  project_id: string;
  company_name: string;
  teaor_code: string | null;
  teaor_description: string | null;
  net_revenue_band: string | null;
  city: string | null;
  domain: string | null;
  hunter_status: string;
  found_contacts: ProspectContact[] | null;
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

function cleanDomain(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
}

/**
 * Promotes an Opten prospect into the CRM: reuses (or creates) a companies row,
 * links it to the project as an approved project_companies row (source='opten'),
 * and copies any staged Hunter contacts into the real contacts table.
 */
export async function promoteProspectToCrm(prospect: ProspectRow) {
  const domain = cleanDomain(prospect.domain);

  let companyId: string | null = null;

  if (domain) {
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
        industry: prospect.teaor_description,
        notes: prospect.teaor_code ? `TEÁOR: ${prospect.teaor_code}` : null,
      })
      .select("id")
      .single();
    if (createError) throw createError;
    companyId = created.id;
  }

  const criteria = [prospect.teaor_description, prospect.net_revenue_band]
    .filter(Boolean)
    .join(" · ");

  const { error: linkError } = await supabase.from("project_companies").upsert(
    {
      organization_id: prospect.organization_id,
      project_id: prospect.project_id,
      company_id: companyId,
      source: "opten",
      status: "jovahagyva",
      match_reason: criteria ? `Opten keresés: ${criteria}` : "Opten keresés",
    },
    { onConflict: "project_id,company_id" },
  );
  if (linkError) throw linkError;

  const staged = (prospect.found_contacts ?? []).filter((person) => person?.email);
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
      .filter((person) => !known.has((person.email ?? "").toLowerCase()))
      .slice(0, 5)
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
