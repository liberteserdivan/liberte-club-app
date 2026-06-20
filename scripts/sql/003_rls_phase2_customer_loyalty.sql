-- =============================================================================
-- FAZ 2 — Müşteri / sadakat / push kayıt tabloları
-- Frontend direct okuma yok; realtime JWT ile filtreli SELECT
-- Destructive işlem YOK
-- =============================================================================

ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS in_app_notifications ENABLE ROW LEVEL SECURITY;

-- in_app_notifications — JWT ile kişisel + genel duyuru
DROP POLICY IF EXISTS customer_select_own_notifications ON in_app_notifications;
CREATE POLICY customer_select_own_notifications ON in_app_notifications
  FOR SELECT TO authenticated
  USING (
    is_active IS TRUE
    AND (
      target_type = 'all'
      OR customer_id = NULLIF(auth.jwt() ->> 'customer_id', '')::bigint
    )
  );

-- customer_loyalty — müşteri kendi kartı (realtime)
DROP POLICY IF EXISTS customer_select_own_loyalty ON customer_loyalty;
CREATE POLICY customer_select_own_loyalty ON customer_loyalty
  FOR SELECT TO authenticated
  USING (customer_id = NULLIF(auth.jwt() ->> 'customer_id', '')::bigint);

-- loyalty_events — müşteri kendi geçmişi
DROP POLICY IF EXISTS customer_select_own_loyalty_events ON loyalty_events;
CREATE POLICY customer_select_own_loyalty_events ON loyalty_events
  FOR SELECT TO authenticated
  USING (customer_id = NULLIF(auth.jwt() ->> 'customer_id', '')::bigint);

-- loyalty_events — admin PIN sonrası tüm kayıtlar
DROP POLICY IF EXISTS admin_select_loyalty_events ON loyalty_events;
CREATE POLICY admin_select_loyalty_events ON loyalty_events
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_admin')::boolean, false) = true
    AND COALESCE((auth.jwt() ->> 'admin_verified')::boolean, false) = true
  );

-- customers — admin dashboard (yeni üye realtime)
DROP POLICY IF EXISTS admin_select_customers ON customers;
CREATE POLICY admin_select_customers ON customers
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_admin')::boolean, false) = true
    AND COALESCE((auth.jwt() ->> 'admin_verified')::boolean, false) = true
  );

-- push_send_log — admin push sonucu
DROP POLICY IF EXISTS admin_select_push_send_log ON push_send_log;
CREATE POLICY admin_select_push_send_log ON push_send_log
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_admin')::boolean, false) = true
    AND COALESCE((auth.jwt() ->> 'admin_verified')::boolean, false) = true
  );

-- push_subscriptions, customer_emails — policy yok = backend-only
