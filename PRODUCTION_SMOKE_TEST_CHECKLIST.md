# Production Smoke Test Checklist

## Otomatik
node scripts/smoke-production-grade.mjs

## Kontroller
- session no cookie: 401 < 5sn
- guardian health: JSON
- login assets: 200
- daily-claim unauth: 401

Manuel: login, restore, daily claim, admin degrade, 503 mesajlari.
