ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS opten_api_key text,
  ADD COLUMN IF NOT EXISTS opten_revenue_bands jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS opten_search_criteria jsonb;

CREATE TABLE IF NOT EXISTS public.opten_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  teaor_code text,
  teaor_description text,
  net_revenue_band text,
  city text,
  domain text,
  raw_opten_data jsonb,
  hunter_status text NOT NULL DEFAULT 'nincs_inditva',
  found_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  promoted_to_crm boolean NOT NULL DEFAULT false,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, company_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opten_prospects TO authenticated;
GRANT ALL ON public.opten_prospects TO service_role;

ALTER TABLE public.opten_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY opten_prospects_org_all ON public.opten_prospects
  FOR ALL TO authenticated
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());