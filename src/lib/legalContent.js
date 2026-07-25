// Gizlilik politikası ve kullanım şartları — App Store / Play Store uyumu

import {
  LOYALTY_PROMO,
  CLUB_APP_NAME,
  STORE_APP_NAME,
  supportEmail
} from './constants.js';

export const LEGAL_UPDATED = '7 Haziran 2026';

export const PRIVACY_PAGE_TITLE = 'Liberte Gastro Cafe Gizlilik Politikası';
export const TERMS_PAGE_TITLE = 'Kullanım Şartları';

export const privacyPolicySections = [
  {
    title: 'Toplanan bilgiler',
    body: 'Kayıt ve sadakat hizmeti kapsamında ad soyad, telefon numarası, e-posta adresi, doğum tarihi (isteğe bağlı), Liberte Puan (LP) bakiyesi ve kampanya geçmişi işlenebilir. Push bildirimleri için cihaz bildirim izni ve bildirim tokenı alınabilir.'
  },
  {
    title: 'Kullanım amacı',
    body: 'Toplanan veriler hesap oluşturma, müşteri doğrulama, sadakat kartı yönetimi, kampanya bildirimi ve müşteri desteği amacıyla kullanılır. Yasal yükümlülüklerin yerine getirilmesi için gerekli hallerde de işlenebilir.'
  },
  {
    title: 'Veriler üçüncü taraflara satılmaz',
    body: 'Kişisel verileriniz pazarlama amacıyla üçüncü taraflara satılmaz veya kiralanmaz. Hizmetin sunulması için zorunlu altyapı sağlayıcıları (barındırma, e-posta, bildirim) yalnızca hizmet kapsamında veri işleyebilir.'
  },
  {
    title: 'Hesabınızı silebilirsiniz',
    body: 'Uygulama içindeki Profil → Hesabımı Sil seçeneği ile hesabınızı kalıcı olarak silebilirsiniz. Silme sonrası kişisel kayıtlarınız ve sadakat verileriniz sistemden kaldırılır; yasal saklama zorunluluğu olan kayıtlar hariç.'
  },
  {
    title: 'İletişim',
    body: `Gizlilik talepleriniz için ${supportEmail} adresine yazabilir veya https://app.libertegastrocafe.com üzerinden işletme iletişim bilgilerine ulaşabilirsiniz.`
  }
];

export const termsOfUseSections = [
  {
    title: 'Hizmet',
    body: `${CLUB_APP_NAME}, ${STORE_APP_NAME} müşterilerine sadakat programı, kampanya ve dijital kart hizmeti sunar.`
  },
  {
    title: 'Üyelik',
    body: 'Kayıt için doğru bilgi vermeniz gerekir. Hesap güvenliğinden siz sorumlusunuz. Tek kişi başına bir hesap önerilir.'
  },
  {
    title: 'Sadakat ve ödüller',
    body: `Liberte Puan (LP) ve ödül hakları Liberte tarafından belirlenir: ${LOYALTY_PROMO} Kötüye kullanım tespitinde hesap kısıtlanabilir veya kapatılabilir.`
  },
  {
    title: 'Bildirimler',
    body: 'Kampanya bildirimleri cihaz ayarlarından veya uygulama içinden yönetilebilir.'
  },
  {
    title: 'Sorumluluk sınırı',
    body: 'Uygulama “olduğu gibi” sunulur. Teknik kesintilerden doğan dolaylı zararlardan Liberte sorumlu tutulamaz.'
  },
  {
    title: 'Değişiklikler',
    body: 'Şartlar güncellenebilir; önemli değişiklikler uygulama veya e-posta ile duyurulur.'
  }
];
