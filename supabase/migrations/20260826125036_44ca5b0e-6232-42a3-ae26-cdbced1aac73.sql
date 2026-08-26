
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_role_is(public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
