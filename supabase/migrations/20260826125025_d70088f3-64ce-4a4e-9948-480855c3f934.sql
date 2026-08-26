
CREATE TYPE public.app_role AS ENUM ('admin','user','viewer');
CREATE TYPE public.company_status AS ENUM ('nincs_valasz','valaszolt','erdeklodik','lezarva');
CREATE TYPE public.email_status AS ENUM ('varakozik','jovahagyva','elkuldot','elvetve');
CREATE TYPE public.response_category AS ENUM ('erdeklodes','talalkozo','elutasitas','kerdes','autovalasz');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_role_is(_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = _role)
$$;

CREATE POLICY "org_select" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());

CREATE POLICY "profiles_select_own_org" ON public.profiles FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.current_role_is('admin'))
  WITH CHECK (organization_id = public.current_org_id());

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  industry text,
  city text,
  status public.company_status NOT NULL DEFAULT 'nincs_valasz',
  opt_out boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  position text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.emails_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  subject text,
  body text,
  status public.email_status NOT NULL DEFAULT 'varakozik',
  ai_generated boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  sent_at timestamptz,
  follow_up_number int NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_id uuid REFERENCES public.emails_queue(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_text text,
  category public.response_category,
  handled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  city text,
  size_sqm numeric,
  status text NOT NULL DEFAULT 'aktiv',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text,
  ai_summary text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_date date,
  source_name text,
  title text NOT NULL,
  summary text,
  key_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  year int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  content_markdown text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  hunter_api_key text,
  openai_api_key text,
  outlook_connected boolean NOT NULL DEFAULT false,
  daily_email_limit int NOT NULL DEFAULT 30,
  send_window_start time NOT NULL DEFAULT '09:00',
  send_window_end time NOT NULL DEFAULT '16:00',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','contacts','emails_queue','responses','projects','project_files','market_reports','daily_digests']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_org_all" ON public.%I FOR ALL TO authenticated USING (organization_id = public.current_org_id()) WITH CHECK (organization_id = public.current_org_id())', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_admin_all" ON public.settings FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.current_role_is('admin'))
  WITH CHECK (organization_id = public.current_org_id() AND public.current_role_is('admin'));

CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_profile public.profiles;
  v_org uuid;
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE auth_user_id = v_uid;
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO public.organizations (name) VALUES ('Saját szervezet') RETURNING id INTO v_org;
    INSERT INTO public.settings (organization_id) VALUES (v_org);
    v_role := 'admin';
  ELSE
    v_role := CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE organization_id = v_org AND role = 'admin') THEN 'user'::public.app_role ELSE 'admin'::public.app_role END;
  END IF;

  INSERT INTO public.profiles (auth_user_id, organization_id, email, name, role)
  VALUES (v_uid, v_org, coalesce(v_email,''), split_part(coalesce(v_email,''), '@', 1), v_role)
  RETURNING * INTO v_profile;

  RETURN v_profile;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
