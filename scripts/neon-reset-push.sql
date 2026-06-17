-- Liberte Club — tüm push cihaz kayıtlarını sıfırla
-- Neon SQL Editor'da çalıştır. Sonra telefonda bildirimleri yeniden aç.

UPDATE app_state
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{pushSubscriptions}',
  '[]'::jsonb,
  true
),
updated_at = now()
WHERE id = 'liberte';
