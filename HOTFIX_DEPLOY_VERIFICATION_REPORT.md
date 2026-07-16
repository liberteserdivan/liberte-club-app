# Hotfix Deploy Doğrulama Raporu (Vercel / Web)

## Sürüm bilgisi
- **Commit hash:** `85dcf83` — `fix: stabilize logout relogin and daily claim error handling`
- **Branch:** `main` (push: `daf1c93..85dcf83`)
- **Önceki commit:** `daf1c93` (Level 1 gece koruması)
- **Production URL:** https://app.liberte.cafe
- **Doğrulama zamanı:** 2026-06-28 ~16:40 (UTC+3)

## Otomatik (kimlik gerektirmeyen) probe sonuçları

| Uç | Status | Gözlem |
|---|---|---|
| `GET /api/health` | **200** | `{"ok":true,"dbOk":true}` → DB erişilebilir |
| `GET /api/guardian/health` | **200** | `status: "healthy"`, `x-safe-mode=off` |
| `GET /api/auth/session` (unauth) | 200 | `{"ok":false}` (oturum yok — normal) |
| `POST /api/loyalty/daily-claim` (unauth) | **401** | `{"error":"Oturum gerekli"}` → endpoint canlı, 500 değil |
| `GET /api/state` (unauth) | 401 | `{"error":"Oturum gerekli"}` (normal) |

**Observability header'ları (tüm yanıtlarda mevcut):**
`x-request-id` (örn. `LBT-974465`, `LBT-ECEB13`, `LBT-7A367B`), `x-handler`,
`x-safe-mode=off`, `x-guardian-status=observed`, `x-duration-ms`.

### Yorum
- Deploy **canlı ve sağlıklı**; DB erişilebilir (`dbOk:true`).
- **Safe Mode kapalı** (`x-safe-mode=off`) → login/QR/LP/daily claim ana akışı sunucu
  tarafında engellenmiyor.
- `daily-claim` ucu yetkisiz istekte temiz **401** dönüyor (crash/500 yok).
- `requestId` (LBT-...) tüm yanıtlarda görünüyor → log eşleştirme mümkün.

## Test sonuçları

| Senaryo | Otomatik doğrulanabilir mi? | Sonuç |
|---|---|---|
| logout → tekrar login | Kısmen | Endpoint'ler canlı; **kimlikli akış manuel test gerektirir** (gerçek credential koda yazılmaz). |
| customer login süresi | Hayır (kimlik gerekir) | Manuel: `POST /api/auth/login` süresi DevTools'tan ölçülmeli. |
| `/api/state` backoff/dedup | Kod + birim test | `tests/hotfix-stability.test.mjs` (9/9 geçti): backoff reset + GET-only dedup doğrulandı. |
| daily LP claim | Hayır (kimlik gerekir) | Manuel test gerekli (aşağıdaki adımlar). |
| `DAILY_CLAIMS_TABLE_MISSING` | Hayır (kimlik gerekir) | Yetkisiz istek 401'de durduğu için DB'ye ulaşmıyor; kimlikli test veya SQL kontrolü gerekir. |
| Guardian incident / requestId | Evet | requestId tüm yanıtlarda var; incident yalnızca tablo eksik + kimlikli claim'de üretilir. |

## requestId örnekleri (doğrulamadan)
`LBT-974465` (health), `LBT-ECEB13` (guardian-health), `LBT-7A367B` (daily-claim 401),
`LBT-7A53F2` (state 401).

## daily_claims tablo / migration durumu
- Yetkisiz probe ile **tablo varlığı doğrulanamadı** (requireSession 401'de durur, DB'ye gitmez).
- **Yapılması gereken (manuel, salt-okunur):** `scripts/sql/check-daily-claims.sql` içindeki
  `select to_regclass('public.daily_claims');` Supabase SQL editöründe çalıştırılmalı.
  - Sonuç **`daily_claims`** (NOT NULL) → tablo var, sorun başka yerde.
  - Sonuç **NULL** → tablo yok; `scripts/sql/008_daily_claims_ensure.sql` (idempotent,
    destructive değil) uygulanmalı. **Otomatik uygulanmadı.**

## Manuel doğrulama adımları (kimlikli)
Gerçek bir test hesabıyla, `RUNTIME_REPRO_STEPS.md` izlenerek:
1. Giriş yap → çıkış → tekrar giriş. Login 2 dk sürmemeli; `/api/state` REMOTE_BACKOFF
   döngüsüne girmemeli.
2. Ana sayfa → "Günlük giriş ödülünü al". Beklenen 200 `{ok:true}`; LP artar.
   - 503 `DAILY_CLAIMS_TABLE_MISSING` gelirse → tablo kontrol SQL'ini çalıştır.

## Mobil build'e geçilebilir mi?
**Henüz HAYIR (koşullu).** Sunucu tarafı sağlıklı ve deploy canlı; ancak kimlikli
**logout→login** ve **daily LP** akışlarının manuel web testi temiz çıkana kadar
Codemagic iOS/Android build'i başlatılmamalı (kullanıcı talimatı). Manuel testler
temiz dönerse mobil build başlatılabilir.
