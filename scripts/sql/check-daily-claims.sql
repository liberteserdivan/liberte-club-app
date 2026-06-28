-- Güvenli KONTROL SQL'i (yalnızca okuma — hiçbir şey değiştirmez).
-- Supabase/Neon SQL editöründe çalıştırın.
-- Sonuç NULL ise tablo YOK demektir → 008_daily_claims_ensure.sql uygulanmalı.

select to_regclass('public.daily_claims') as daily_claims;

-- Sütun ve index durumunu da görmek için (opsiyonel, salt-okunur):
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'daily_claims'
order by ordinal_position;

select indexname
from pg_indexes
where schemaname = 'public' and tablename = 'daily_claims';
