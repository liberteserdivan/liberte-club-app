# Runtime Tekrar-Üretim (Repro) Adımları

Gerçek kullanımdaki bozuk akışları DevTools/network ile gözlemlemek için adımlar.
Hiçbir gerçek secret/PII yazılmaz; yalnızca header ve status kodlarına bakılır.

## A. Logout → Tekrar Login

**Adımlar**
1. DevTools → Network açık, "Preserve log" işaretli.
2. Giriş yap → ana ekran açılsın.
3. Profil → Çıkış yap.
4. Hemen tekrar giriş yap (aynı telefon + PIN).

**Beklenen request sırası**
- Logout: `POST /api/auth/session` (fire-and-forget, ~4sn timeout). UI bunu **beklememeli**.
- Login: `POST /api/auth/login` → 200, gövdede `customer` + `loyalty` olmalı.
- Ardından (≈6sn sonra) en fazla bir `GET /api/state` (ilk tam pull) — ana ekran bunu beklemeden açılır.

**Kontrol edilecek header'lar**
- `x-request-id` (LBT-...), `x-safe-mode` (`off` beklenir), `x-handler`, `x-duration-ms`.

**Kırmızı bayraklar**
- `GET /api/state` isteklerinin tekrar tekrar **REMOTE_BACKOFF** ile hiç ağa çıkmaması.
- Login sonrası tekrarlayan `GET /api/auth/session` döngüsü.
- "Hesap bilgilerin yüklenemedi" uyarısı + otomatik login ekranına atılma (hidrasyon timeout'u).
- `x-safe-mode` değerinin `on:...` kalması (admin paneli kapalıyken).

**Rapora yazılacak**: başarısız login'in `x-request-id`'si ve son `/api/state` status'u.

## B. Günlük LP / Daily Claim

**Adımlar**
1. Giriş yap → Ana sayfa → "Günlük giriş ödülünü al (+1 LP)".

**Beklenen**
- `POST /api/loyalty/daily-claim` → 200 `{ ok:true, loyalty, dailyClaims }`.
- UI'da LP artar, buton kaybolur.

**Kırmızı bayraklar**
- 500 + ham `relation "daily_claims" does not exist` → migration eksik
  (artık **503 + `DAILY_CLAIMS_TABLE_MISSING`** dönmeli; admin Guardian incident görmeli).
- 503 `DATABASE_TRANSIENT` (soğuk DB) → birkaç saniye sonra tekrar denenmeli.
- 400 "bugün zaten aldın" → ikinci claim için doğru.

**Rapora yazılacak**: claim isteğinin `x-request-id`'si ve dönen `code`.

## C. Safe Mode etkisi
- Normal müşteri akışında `x-safe-mode: off` beklenir.
- Admin "System Health" panelini açıp latency varken `on:...` görülebilir; bu durumda
  müşteri istemcisinde polling aralığı genişler ama daily claim/login engellenmez.

## D. Minimal otomasyon
- Bu turda eklenen birim testler (`tests/hotfix-stability.test.mjs`) backoff reset,
  GET-only dedup, Safe Mode reset/malformed, tablo-eksik kodunu doğrular.
- Playwright e2e eklenmedi (gerçek credential gerektirir); gerekirse test credential'lar
  ortam değişkeniyle sağlanmalı, secret koda yazılmamalı.
