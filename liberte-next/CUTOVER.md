# Liberte Next — Cutover kapısı

Production Capacitor `webDir` veya kök `api/` yönlendirmesi **yalnızca** aşağıdaki maddeler geçtikten sonra değiştirilir.

## Kontrol listesi

- [ ] Token varken uygulama açılışı < 1 sn (yerel oturum)
- [ ] Home'da LP doğru (veya bilinçli 0)
- [ ] Kasiyer QR 10 ardışık başarılı verify
- [ ] LP earn üye ekranına yansır
- [ ] Legacy APK rollback hazır (`main` + eski `dist` build)

## Cutover adımları (liste geçince)

1. Kök `capacitor.config.json` → `"webDir": "liberte-next/client/dist"`
2. Vercel `outputDirectory` / build → `next:build`
3. İsteğe bağlı: `/api/n-*` → kanonik `/api/*` alias
4. Codemagic android-release + Play internal
5. 48 saat rollback penceresi

## Şu anki durum

**Cutover YAPILMADI.** Legacy production ayakta kalır.
