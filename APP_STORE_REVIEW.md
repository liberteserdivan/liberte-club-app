# App Store Review Notes — Liberte Gastro Cafe

App Store Connect → **App Review Information** → **Notes** alanına aşağıdaki metni kopyalayın.

---

## Review note (EN)

```
This is the official loyalty app for Liberte Gastro Cafe.

**Device support: iPhone only** (not optimized for iPad; iPad screenshots not required).

Customers log in with phone number and PIN, view loyalty card, show QR code, browse menu, view campaigns, and manage profile.

Admin features (QR scan, admin panel) require a separate admin PIN after login — use "Continue as customer" to skip admin mode during review.

Account deletion: Profile → Delete Account (Hesabımı Sil). Permanent server-side deletion.

Privacy Policy: https://app.liberte.cafe/privacy
Terms of Use: https://app.liberte.cafe/terms
Support: https://app.liberte.cafe/support

Demo account (customer — recommended for review):
Phone: 5550100001
PIN: [Set in App Store Connect only — do not commit real PIN to git]

Test flow:
1. Launch app → splash screen → login
2. Enter demo phone + PIN → Home / Card tab → QR code
3. Menu tab → tap product → detail modal opens (close with X)
4. Profile → legal links open in-app

Push notifications: web/PWA only; native iOS app does not show push prompts.

Camera: only used when admin enters admin PIN and opens QR scanner.
```

---

## App Store Connect checklist

- [ ] Demo PIN written in Review Notes (not in git)
- [ ] Demo account active on production API
- [ ] Privacy Policy URL loads without JavaScript
- [ ] Support URL: https://app.liberte.cafe/support
- [ ] Export compliance: No (standard HTTPS only)
- [ ] iPhone screenshots only (iPad desteği kapalı)

---

## Sadakat kuralı (referans)

> Liberte'de müdavim olmak kazandırır. 7. kahven, 7. tatlın ve 12. burgerin bizden.
