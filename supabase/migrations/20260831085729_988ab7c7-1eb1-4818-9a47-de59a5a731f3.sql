CREATE TABLE public.outlook_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_email text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.outlook_connections TO service_role;
ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;

-- Service role only: no user-facing policies needed because tokens are encrypted server-side
CREATE POLICY "Service role manages outlook connections" ON public.outlook_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.emails_queue
  ADD COLUMN IF NOT EXISTS send_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_outlook_connections_updated_at
BEFORE UPDATE ON public.outlook_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();