ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS anthropic_api_key text,
  ADD COLUMN IF NOT EXISTS preferred_ai_provider text NOT NULL DEFAULT 'anthropic';

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_preferred_ai_provider_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_preferred_ai_provider_check
  CHECK (preferred_ai_provider IN ('openai', 'anthropic'));