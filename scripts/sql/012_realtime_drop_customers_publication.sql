-- Liberte Club — Realtime publication PII daraltma (BUG-005)
-- customers tablosunu supabase_realtime publication'dan cikarir (idempotent).
-- Admin UI musterileri API fetch ile alir; realtime INSERT dinleme bu tabloda kaldirilir.
-- Destructive table ops yok (yalniz publication ALTER).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
  END IF;
END $$;
