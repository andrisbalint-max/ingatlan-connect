CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  job_name text,
  job_schedule text,
  job_command text
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN cron.schedule(job_name, job_schedule, job_command);
END;
$$;

CREATE OR REPLACE FUNCTION public.unschedule_cron_job(
  job_name text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_cron_job(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_cron_job(text) TO service_role;