-- FAZ 2 rollback — müşteri/sadakat policy + RLS kapat

DROP POLICY IF EXISTS customer_select_own_loyalty ON customer_loyalty;
DROP POLICY IF EXISTS customer_select_own_loyalty_events ON loyalty_events;
DROP POLICY IF EXISTS admin_select_loyalty_events ON loyalty_events;
DROP POLICY IF EXISTS admin_select_customers ON customers;
DROP POLICY IF EXISTS admin_select_push_send_log ON push_send_log;
DROP POLICY IF EXISTS customer_select_own_notifications ON in_app_notifications;

ALTER TABLE IF EXISTS customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_loyalty DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS loyalty_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_send_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS in_app_notifications DISABLE ROW LEVEL SECURITY;
