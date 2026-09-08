-- Riport típusok: napi összegzés (egy sor / nap) és heti összefoglaló
-- (egy sor / hét, hétfőn). Idempotens — akkor is biztonságosan lefut, ha a
-- korábbi report_type migráció már megtörtént.

ALTER TABLE public.market_reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'kezi',
  ADD COLUMN IF NOT EXISTS period_start date NULL,
  ADD COLUMN IF NOT EXISTS period_end date NULL;

ALTER TABLE public.market_reports
  DROP CONSTRAINT IF EXISTS market_reports_report_type_check;

ALTER TABLE public.market_reports
  ADD CONSTRAINT market_reports_report_type_check
  CHECK (report_type IN ('kezi', 'napi_piaci_hir', 'napi_osszefoglalo', 'heti_osszefoglalo'));

-- A naptár nézet napra és típusra szűr, ezért indexeljük ezt a hármast.
CREATE INDEX IF NOT EXISTS market_reports_org_date_type_idx
  ON public.market_reports (organization_id, report_date, report_type);
