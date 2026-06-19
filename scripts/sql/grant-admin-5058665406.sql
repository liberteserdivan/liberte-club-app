-- 05058665406 numaralı kullanıcıya admin yetkisi (Supabase SQL Editor'de çalıştırın)
-- Telefon normalize formatı: 5058665406

UPDATE customers
SET is_admin = true, updated_at = now()
WHERE phone = '5058665406';

UPDATE auth_sessions
SET role = 'admin'
WHERE customer_id IN (SELECT id FROM customers WHERE phone = '5058665406')
  AND expires_at > now();

-- Kontrol:
-- SELECT id, phone, name, is_admin FROM customers WHERE phone = '5058665406';
