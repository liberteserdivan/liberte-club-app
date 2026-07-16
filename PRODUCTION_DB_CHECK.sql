-- PRODUCTION_DB_CHECK.sql
-- Liberte Club — Uretim veritabani SAGLIK + SEMA dogrulamasi.
-- SADECE OKUR. Hicbir tabloyu/veriyi DEGISTIRMEZ (CREATE/ALTER/INSERT/UPDATE/DELETE YOK).
-- Supabase SQL Editor veya psql ile production DATABASE_URL uzerinde calistirin.
--
-- Beklenen: tablo adlari NULL DEGIL donmeli. NULL donen tablo = migration eksik.

-- 1) Baglanti + kimlik
select now()                          as db_now;
select current_database()             as database,
       current_user                   as db_user,
       version()                      as pg_version;

-- 2) Gerekli tablolar var mi? (yoksa NULL doner, hata firlatmaz)
select to_regclass('public.customers')          as customers,
       to_regclass('public.auth_sessions')       as auth_sessions,
       to_regclass('public.customer_loyalty')     as customer_loyalty,
       to_regclass('public.daily_claims')         as daily_claims,
       to_regclass('public.qr_used_tokens')       as qr_used_tokens,
       to_regclass('public.customer_emails')      as customer_emails,
       to_regclass('public.push_subscriptions')   as push_subscriptions;

-- 3) Kritik index / constraint kontrolu (yoksa satir donmez, hata firlatmaz)
select indexrelid::regclass as index_name, indrelid::regclass as table_name
from pg_index
where indrelid in (
  to_regclass('public.auth_sessions'),
  to_regclass('public.daily_claims'),
  to_regclass('public.customer_loyalty'),
  to_regclass('public.customers')
)
order by table_name, index_name;

-- auth_sessions token_hash lookup'i icin index var mi?
select to_regclass('public.auth_sessions') as auth_sessions_tbl,
       exists (
         select 1 from pg_indexes
         where schemaname = 'public' and tablename = 'auth_sessions'
           and indexdef ilike '%token_hash%'
       ) as has_token_hash_index;

-- daily_claims dedup (customer/gun) unique constraint/index var mi?
select exists (
  select 1 from pg_indexes
  where schemaname = 'public' and tablename = 'daily_claims'
) as daily_claims_has_any_index;

-- 4) Satir sayilari — tablo varsa say, YOKSA patlamadan NULL don.
--    (to_regclass NULL ise alt sorgu calismaz; CASE ile guvenli.)
do $$
declare
  c_customers     bigint;
  c_auth_sessions bigint;
  c_daily_claims  bigint;
  c_loyalty       bigint;
begin
  if to_regclass('public.customers') is not null then
    execute 'select count(*) from public.customers' into c_customers;
  end if;
  if to_regclass('public.auth_sessions') is not null then
    execute 'select count(*) from public.auth_sessions' into c_auth_sessions;
  end if;
  if to_regclass('public.daily_claims') is not null then
    execute 'select count(*) from public.daily_claims' into c_daily_claims;
  end if;
  if to_regclass('public.customer_loyalty') is not null then
    execute 'select count(*) from public.customer_loyalty' into c_loyalty;
  end if;

  raise notice 'customers=% auth_sessions=% daily_claims=% customer_loyalty=%',
    coalesce(c_customers::text, 'TABLE_MISSING'),
    coalesce(c_auth_sessions::text, 'TABLE_MISSING'),
    coalesce(c_daily_claims::text, 'TABLE_MISSING'),
    coalesce(c_loyalty::text, 'TABLE_MISSING');
end $$;

-- 5) Aktif (gecerli) oturum sayisi — auth_sessions varsa
select case
  when to_regclass('public.auth_sessions') is null then null
  else (select count(*) from public.auth_sessions where expires_at > now())
end as active_sessions;
