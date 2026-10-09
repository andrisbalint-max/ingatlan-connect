ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_preferred_ai_provider_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_preferred_ai_provider_check
  CHECK (preferred_ai_provider IN ('openai','anthropic','claude_agents'));
ALTER TABLE public.settings ALTER COLUMN preferred_ai_provider SET DEFAULT 'claude_agents';
UPDATE public.settings SET preferred_ai_provider = 'claude_agents', ai_provider_out_of_credit = false;

ALTER TABLE public.emails_queue
  ADD COLUMN IF NOT EXISTS agent_name text,
  ADD COLUMN IF NOT EXISTS personalization_note text;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS agent_category text,
  ADD COLUMN IF NOT EXISTS agent_summary text,
  ADD COLUMN IF NOT EXISTS suggested_reply text,
  ADD COLUMN IF NOT EXISTS agent_processed_at timestamptz;

ALTER TABLE public.opten_prospects
  ADD COLUMN IF NOT EXISTS decision_maker_source text,
  ADD COLUMN IF NOT EXISTS decision_maker_source_url text,
  ADD COLUMN IF NOT EXISTS agent_note text;

CREATE TABLE public.agent_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
GRANT SELECT ON public.agent_api_keys TO authenticated;
GRANT ALL ON public.agent_api_keys TO service_role;
ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_keys_admin_select" ON public.agent_api_keys FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.current_role_is('admin'));

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor text NOT NULL,
  description text NOT NULL,
  api_key_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_org_created_idx ON public.activity_log (organization_id, created_at DESC);
CREATE INDEX activity_log_key_created_idx ON public.activity_log (api_key_id, created_at DESC);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_org_select" ON public.activity_log FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE TABLE public.email_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'kezi',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_blocklist_org_email_idx ON public.email_blocklist (organization_id, lower(email));
GRANT SELECT, INSERT, DELETE ON public.email_blocklist TO authenticated;
GRANT ALL ON public.email_blocklist TO service_role;
ALTER TABLE public.email_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocklist_org_select" ON public.email_blocklist FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "blocklist_admin_insert" ON public.email_blocklist FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.current_role_is('admin'));
CREATE POLICY "blocklist_admin_delete" ON public.email_blocklist FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.current_role_is('admin'));