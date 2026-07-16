-- =============================================================================
-- FAZ 1 — Düşük riskli tablolar (menü, kampanya, kupon, bildirim)
-- Hassas tablolara DOKUNULMAZ
-- Destructive işlem YOK
-- =============================================================================

ALTER TABLE IF EXISTS menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons ENABLE ROW LEVEL SECURITY;

-- in_app_notifications → Faz 2 (JWT secret production'da doğrulandıktan sonra)

-- menu_categories — herkese okuma
DROP POLICY IF EXISTS select_active_menu_categories ON menu_categories;
CREATE POLICY select_active_menu_categories ON menu_categories
  FOR SELECT TO anon, authenticated
  USING (true);

-- menu_items — herkese okuma
DROP POLICY IF EXISTS select_menu_items ON menu_items;
CREATE POLICY select_menu_items ON menu_items
  FOR SELECT TO anon, authenticated
  USING (true);

-- campaigns — yalnızca aktif
DROP POLICY IF EXISTS select_active_campaigns ON campaigns;
CREATE POLICY select_active_campaigns ON campaigns
  FOR SELECT TO anon, authenticated
  USING (active IS TRUE);

-- coupons — yalnızca aktif
DROP POLICY IF EXISTS select_active_coupons ON coupons;
CREATE POLICY select_active_coupons ON coupons
  FOR SELECT TO anon, authenticated
  USING (active IS TRUE);
