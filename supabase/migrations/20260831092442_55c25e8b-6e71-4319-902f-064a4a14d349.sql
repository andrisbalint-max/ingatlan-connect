CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.schedule_cron_job(job_name text, job_schedule text, job_command text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  RETURN cron.schedule(job_name, job_schedule, job_command);
END;
$function$;

CREATE OR REPLACE FUNCTION public.unschedule_cron_job(job_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  PERFORM cron.unschedule(job_name);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_cron_job(text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.unschedule_cron_job(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_cron_job(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_cron_job(text) TO service_role;