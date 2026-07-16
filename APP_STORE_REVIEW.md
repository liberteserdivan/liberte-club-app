# App Store Review Notes — Liberte Gastro Cafe

App Store Connect → **App Review Information** → **Notes** alanına aşağıdaki metni kopyalayın.

---

## Review note (EN)

```
This is the official loyalty app for Liberte Gastro Cafe.

**Device support: iPhone only** (not optimized for iPad; iPad screenshots not required).

Customers log in with phone number and PIN. After the first successful login, the app remembers the device and opens directly on next launch (no logout button — session persists until account deletion).

View loyalty card, show QR code, browse menu, view campaigns, and manage profile.

Admin features (QR scan, admin panel) are available for admin accounts after login.

Account deletion: Profile → Delete Account (Hesabımı Sil). Permanent server-side deletion.

Privacy Policy: https://app.liberte.cafe/privacy
Terms of Use: https://app.liberte.cafe/terms
Support: https://app.liberte.cafe/support

Demo account (customer — recommended for review):
Phone: 5550100001
PIN: [Set in App Store Connect only — do not commit real PIN to git]

Test flow:
1. Launch app → splash → first login with demo phone + PIN (or auto-login if already used on device)
2. Home / Card tab → QR code (tap Retry if network is slow)
3. Menu tab → tap product → detail modal opens (close with X)
4. Profile → legal links; Delete Account available (no Logout button)
5. Optional: accept push notification prompt on Home or Profile

Push notifications: native iOS/Android app supports push via Firebase. You may enable notifications when prompted, or skip via "Later".

Camera: only used when admin opens QR scanner from admin panel.
```

---

## App Store Connect checklist

- [ ] Demo PIN written in Review Notes (not in git)
- [ ] Demo account active on production API
- [ ] Privacy Policy URL loads without JavaScript
- [ ] Support URL: https://app.liberte.cafe/support
- [ ] Export compliance: No (standard HTTPS only)
- [ ] Play Console / App Store screenshots uploaded
- [ ] Production smoke test: login → QR → admin members (if admin) → delete account
- [ ] QR_SIGNING_SECRET set in Vercel

---

## Sadakat kuralı (referans — LP v1.1)

> Liberte'de müdavim olmak kazandırır. Kahve +1 LP, tatlı +2 LP, burger +3 LP. 7 LP kahve ikramı, 15 LP tatlı ikramı, 25 LP burger ikramı.

## Üyelik seviyeleri (v1.1)

> Seviye **toplam kazanılan LP** ile belirlenir; ikram kullanımı seviyeyi düşürmez. Bronze 0–49, Silver 50–149, Gold 150–299, Black 300+. Silver/Gold/Black ayda 1 kez %5/%10/%15 cafe içi indirim (LP ikramı ve kampanyalarla birleşmez). Tüm üyeler doğum gününde 1 kahve ikramı alabilir (kasiyer onayı).
