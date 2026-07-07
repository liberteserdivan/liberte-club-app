-- =============================================================================
-- RLS — Tüm fazlar (Supabase SQL Editor'da tek seferde çalıştır)
-- API postgres rolü BYPASSRLS — backend etkilenmez
-- =============================================================================

-- FAZ 1
ALTER TABLE IF EXISTS menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_active_menu_categories ON menu_categories;
CREATE POLICY select_active_menu_categories ON menu_categories
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS select_menu_items ON menu_items;
CREATE POLICY select_menu_items ON menu_items
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS select_active_campaigns ON campaigns;
CREATE POLICY select_active_campaigns ON campaigns
  FOR SELECT TO anon, authenticated
  USING (active IS TRUE);

DROP POLICY IF EXISTS select_active_coupons ON coupons;
CREATE POLICY select_active_coupons ON coupons
  FOR SELECT TO anon, authenticated
  USING (active IS TRUE);

-- FAZ 2
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS in_app_notifications ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS customer_select_own_loyalty ON customer_loyalty;
CREATE POLICY customer_select_own_loyalty ON customer_loyalty
  FOR SELECT TO authenticated
  USING (customer_id = NULLIF(auth.jwt() ->> 'customer_id', '')::bigint);

DROP POLICY IF EXISTS customer_select_own_loyalty_events ON loyalty_events;
CREATE POLICY customer_select_own_loyalty_events ON loyalty_events
  FOR SELECT TO authenticated
  USING (customer_id = NULLIF(auth.jwt() ->> 'customer_id', '')::bigint);

DROP POLICY IF EXISTS admin_select_loyalty_events ON loyalty_events;
CREATE POLICY admin_select_loyalty_events ON loyalty_events
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_admin')::boolean, false) = true
    AND COALESCE((auth.jwt() ->> 'admin_verified')::boolean, false) = true
  );

DROP POLICY IF EXISTS admin_select_customers ON customers;
CREATE POLICY admin_select_customers ON customers
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_admin')::boolean, false) = true
    AND COALESCE((auth.jwt() ->> 'admin_verified')::boolean, false) = true
  );

DROP POLICY IF EXISTS admin_select_push_send_log ON push_send_log;
CREATE POLICY admin_select_push_send_log ON push_send_log
  FOR SELECT TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_admin')::boolean, false) = true
    AND COALESCE((auth.jwt() ->> 'admin_verified')::boolean, false) = true
  );

-- FAZ 3
ALTER TABLE IF EXISTS customer_pin_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS email_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_state_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupon_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wheel_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wheel_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS first_order_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS google_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guardian_safe_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guardian_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guardian_action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS guardian_action_executions ENABLE ROW LEVEL SECURITY;
