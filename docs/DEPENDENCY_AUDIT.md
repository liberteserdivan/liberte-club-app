# Dependency audit (BUG-024)

Tarih: 2026-07-15

## Durum


pm audit --omit=dev ve 
pm audit fix (breaking degil) calistirildi.

Kalan: **8 moderate** — irebase-admin -> @google-cloud/storage / @google-cloud/firestore -> 	eeny-request / gaxios -> uuid (<11.1.1) zinciri.

## Neden force uygulanmadi


pm audit fix --force irebase-admin@10.3.0 oneriyor; bu major/breaking downgrade riski. Push bildirim yolu icin ayri major bump + smoke gerektirir.

## Izleme

- Sonraki firebase-admin minor/patch surumu uuid guncellemesini cozerse 
pm audit fix tekrar dene.
- Breaking major ayri PR.