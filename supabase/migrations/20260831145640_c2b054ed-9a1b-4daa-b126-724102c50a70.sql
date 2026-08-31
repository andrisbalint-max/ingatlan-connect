-- settings: no Opten API (no API exists); Excel import mapping instead
ALTER TABLE public.settings DROP COLUMN IF EXISTS opten_api_key;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS opten_excel_column_mapping jsonb NULL;
ALTER TABLE public.settings ALTER COLUMN opten_revenue_bands SET DEFAULT '[]'::jsonb;

ALTER TABLE public.projects DROP COLUMN IF EXISTS opten_search_criteria;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_activity_categories text[] NOT NULL DEFAULT '{}'::text[];

-- rebuild opten_prospects as an organization-wide shared company database
DROP TABLE IF EXISTS public.opten_prospects CASCADE;

CREATE TABLE public.opten_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  teaor_code text NULL,
  teaor_description text NULL,
  activity_category text NULL,
  net_revenue_band text NULL,
  city text NULL,
  domain text NULL,
  raw_opten_data jsonb NULL,
  hunter_status text NOT NULL DEFAULT 'nincs_inditva',
  found_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_maker_name text NULL,
  decision_maker_email text NULL,
  decision_maker_position text NULL,
  decision_maker_match_confidence text NULL,
  promoted_to_crm boolean NOT NULL DEFAULT false,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, company_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opten_prospects TO authenticated;
GRANT ALL ON public.opten_prospects TO service_role;
ALTER TABLE public.opten_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY opten_prospects_org_all ON public.opten_prospects FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE INDEX opten_prospects_org_category_idx ON public.opten_prospects (organization_id, activity_category);

CREATE TABLE public.project_opten_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  opten_prospect_id uuid NOT NULL REFERENCES public.opten_prospects(id) ON DELETE CASCADE,
  match_reason text,
  status text NOT NULL DEFAULT 'javasolt',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, opten_prospect_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_opten_matches TO authenticated;
GRANT ALL ON public.project_opten_matches TO service_role;
ALTER TABLE public.project_opten_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_opten_matches_org_all ON public.project_opten_matches FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());