ALTER TABLE public.market_reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'kezi',
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;