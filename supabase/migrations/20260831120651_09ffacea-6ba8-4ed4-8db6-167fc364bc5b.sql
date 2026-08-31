ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS monthly_ai_budget_usd numeric NULL,
  ADD COLUMN IF NOT EXISTS ai_usage_estimated_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_budget_warning_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ai_provider_out_of_credit boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_audience text;

ALTER TABLE public.emails_queue
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.market_reports
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE TABLE IF NOT EXISTS public.project_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  match_reason text,
  source text NOT NULL DEFAULT 'ai_suggested',
  status text NOT NULL DEFAULT 'javasolt',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_companies TO authenticated;
GRANT ALL ON public.project_companies TO service_role;

ALTER TABLE public.project_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_companies_org_all ON public.project_companies;
CREATE POLICY project_companies_org_all ON public.project_companies
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());