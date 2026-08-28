ALTER TYPE public.email_status ADD VALUE IF NOT EXISTS 'szerkesztett';

ALTER TABLE public.emails_queue ADD COLUMN IF NOT EXISTS context_note text;