// Gizlilik politikası ve kullanım şartları — App Store / Play Store uyumu

import { LOYALTY_PROMO, CLUB_APP_NAME, STORE_APP_NAME } from './constants.js';

export const LEGAL_UPDATED = '5 Haziran 2026';

export const privacyPolicySections = [
  {
    title: 'Veri sorumlusu',
    body: 'Liberte Gastro Cafe (“Liberte”) sadakat uygulaması kapsamında kişisel verileriniz Liberte tarafından işlenir. İletişim: liberteserdivan@gmail.com'
  },
  {
    title: 'Toplanan veriler',
    body: 'Telefon numarası, ad soyad, e-posta, doğum tarihi (isteğe bağlı), sadakat damgaları, kampanya geçmişi ve bildirim tercihleri. Push bildirimleri için cihaz bildirim tokenı işlenebilir.'
  },
  {
    title: 'Kullanım amacı',
    body: 'Sadakat kartı, QR doğrulama, kampanya ve ödül bildirimleri, müşteri desteği ve yasal yükümlülüklerin yerine getirilmesi.'
  },
  {
    title: 'Saklama ve güvenlik',
    body: 'Veriler güvenli sunucularda saklanır. Hesabınızı sildiğinizde kişisel kayıtlarınız ve sadakat verileriniz sistemden kaldırılır; yasal zorunluluk hariç.'
  },
  {
    title: 'Haklarınız',
    body: 'KVKK kapsamında erişim, düzeltme, silme ve itiraz haklarına sahipsiniz. Uygulama içinden “Hesabımı Sil” veya e-posta ile talepte bulunabilirsiniz.'
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
    body: `Damga ve ikram hakları Liberte tarafından belirlenir: ${LOYALTY_PROMO} Kötüye kullanım tespitinde hesap kısıtlanabilir veya kapatılabilir.`
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
