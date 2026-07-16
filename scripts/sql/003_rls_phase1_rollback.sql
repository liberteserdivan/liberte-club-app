-- FAZ 1 rollback — policy kaldır + RLS kapat (düşük riskli tablolar)

DROP POLICY IF EXISTS select_active_menu_categories ON menu_categories;
DROP POLICY IF EXISTS select_menu_items ON menu_items;
DROP POLICY IF EXISTS select_active_campaigns ON campaigns;
DROP POLICY IF EXISTS select_active_coupons ON coupons;

ALTER TABLE IF EXISTS menu_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menu_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons DISABLE ROW LEVEL SECURITY;
