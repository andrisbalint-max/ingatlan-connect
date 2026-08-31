ALTER TABLE public.emails_queue
  ADD COLUMN IF NOT EXISTS conversation_id text,
  ADD COLUMN IF NOT EXISTS graph_message_id text;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS graph_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS responses_graph_message_id_key
  ON public.responses (organization_id, graph_message_id)
  WHERE graph_message_id IS NOT NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS follow_up_paused_until timestamptz;