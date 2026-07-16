-- =============================================================================
-- Liberte Club — Supabase Realtime hazırlığı (NON-DESTRUCTIVE)
-- DROP / TRUNCATE / DELETE / kolon silme YOK
-- =============================================================================

-- 1) in_app_notifications — yeni kolonlar (mevcut satırlara DEFAULT uygulanır)
ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'customer';
ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE in_app_notifications ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_customer ON in_app_notifications (customer_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_target ON in_app_notifications (target_type);

-- 2) supabase_realtime publication — idempotent ekleme
-- Müşteri öncelik: customer_loyalty, loyalty_events, campaigns, coupons, in_app_notifications
-- Admin dashboard: customers, push_send_log (sınırlı INSERT dinleme + API fetch)
-- NOT: push_subscriptions realtime'a EKLENMEDİ (kodda subscription yok, token sızıntı riski)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customer_loyalty'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_loyalty;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'loyalty_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_events;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'in_app_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'coupons'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.coupons;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'push_send_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.push_send_log;
  END IF;
END $$;

-- 3) RLS — şimdilik ZORUNLU AÇILMIYOR (yorum satırı)
-- Store öncesi: custom JWT + RLS politikaları eklenecek.
-- ALTER TABLE customer_loyalty ENABLE ROW LEVEL SECURITY;
