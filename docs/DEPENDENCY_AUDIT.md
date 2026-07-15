# Dependency audit (BUG-024)

Tarih: 2026-07-15 (guncelleme)

## Durum

`npm audit --omit=dev` temiz (0 vulnerability).

Cozum: `package.json` `overrides.uuid = ^11.1.1` — firebase-admin transitive zincirindeki
zayif uuid surumunu zorla yukseltir. `npm audit fix --force` firebase-admin@10.3.0
downgrade onerdigi icin uygulanmadi.

## Dogrulama

- `npm ls uuid` → 11.1.1 (overridden)
- firebase-admin ^13.10.0 korundu