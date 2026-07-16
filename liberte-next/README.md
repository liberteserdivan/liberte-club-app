# Liberte Next

Greenfield MVP — mevcut production DB üzerinde sade istemci + ince API.

## Legacy freeze

Cutover tamamlanana kadar **kök** `src/`, `api/` (`n-*.js` hariç) ve Capacitor `webDir: dist` **değiştirilmez** (yalnızca acil hotfix).

Tüm yeni iş bu klasörde (`liberte-next/`) yapılır.

## Komutlar

```bash
# İstemci
npm run next:dev
npm run next:build

# Test
npm run next:test
```

## API yüzeyi (legacy'yi ezmez)

| Path | Açıklama |
|------|----------|
| `/api/n-auth` | login, session, logout, me |
| `/api/n-qr` | generate |
| `/api/n-cashier` | verify, lp |

## Cutover

Bkz. [CUTOVER.md](./CUTOVER.md) — kontrol listesi geçmeden production webDir/api değiştirilmez.
