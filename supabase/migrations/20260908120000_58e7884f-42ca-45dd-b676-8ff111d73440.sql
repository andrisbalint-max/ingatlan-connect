-- Weekly market report support: tag market_reports rows by how they were
-- created, and (for auto-generated weekly reports) record which week they
-- summarize.

ALTER TABLE public.market_reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'kezi',
  ADD COLUMN IF NOT EXISTS period_start date NULL,
  ADD COLUMN IF NOT EXISTS period_end date NULL;

ALTER TABLE public.market_reports
  DROP CONSTRAINT IF EXISTS market_reports_report_type_check;

ALTER TABLE public.market_reports
  ADD CONSTRAINT market_reports_report_type_check
  CHECK (report_type IN ('kezi', 'napi_piaci_hir', 'heti_osszefoglalo'));
