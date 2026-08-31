CREATE POLICY market_reports_org_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'market-reports' AND (storage.foldername(name))[1] = (public.current_org_id())::text);
CREATE POLICY market_reports_org_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'market-reports' AND (storage.foldername(name))[1] = (public.current_org_id())::text);
CREATE POLICY market_reports_org_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'market-reports' AND (storage.foldername(name))[1] = (public.current_org_id())::text)
  WITH CHECK (bucket_id = 'market-reports' AND (storage.foldername(name))[1] = (public.current_org_id())::text);
CREATE POLICY market_reports_org_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'market-reports' AND (storage.foldername(name))[1] = (public.current_org_id())::text);