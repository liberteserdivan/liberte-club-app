import { privacyPolicyUrl, supportEmail } from './constants.js';

export const SUPPORT_PAGE_TITLE = 'Liberte Gastro Cafe Destek';

export const SUPPORT_INTRO =
  'Kullanıcılar uygulama ile ilgili soru, sorun ve destek talepleri için bizimle iletişime geçebilir.';

// İşletme telefonu — gerektiğinde güncelleyin
export const SUPPORT_PHONE_DISPLAY = '+90 505 866 54 06';
export const SUPPORT_PHONE_TEL = '+905058665406';

export const SUPPORT_ADDRESS =
  'Bahçelievler Mahallesi Muhsin Yazıcıoğlu Bulvarı No 64/A Serdivan/Sakarya';

export const SUPPORT_TOPICS = [
  'Giriş ve kayıt sorunları',
  'PIN yenileme',
  'Sadakat kartı / QR kod sorunları',
  'Damga ve ikram işlemleri',
  'Kampanya bildirimleri',
  'Hesap silme ve gizlilik talepleri'
];

export const supportPageUrl = 'https://app.liberte.cafe/support';

export const supportContact = {
  email: supportEmail,
  phoneDisplay: SUPPORT_PHONE_DISPLAY,
  phoneTel: SUPPORT_PHONE_TEL,
  address: SUPPORT_ADDRESS,
  privacyUrl: privacyPolicyUrl
};
