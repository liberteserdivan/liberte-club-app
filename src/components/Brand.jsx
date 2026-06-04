import { DEFAULT_LOGO } from '../lib/constants.js';

// Kafe marka logosu veya varsayılan L monogramı
export default function Brand({ db, small = false, admin = false, header = false, login = false }) {
  const cafe = db.settings?.cafe_name || 'Liberte Gastro Cafe';
  const logoSrc = db.settings?.logo || DEFAULT_LOGO;
  const hasLogo = Boolean(logoSrc);

  const monogram = (
    <div className="brandMonogram" aria-hidden={hasLogo}>
      <b>L</b>
    </div>
  );

  const image = hasLogo && (
    <img
      className="brandMarkImg"
      src={logoSrc}
      alt={cafe}
    />
  );

  // Giriş ekranı — büyük dairesel logo
  if (login) {
    return (
      <div className="brandMark login">
        {image || monogram}
      </div>
    );
  }

  // Header ve admin: açık zeminli kutu — koyu logo da okunur
  if (header || admin) {
    return (
      <div className={`brandMark${header ? ' header' : ' admin'}${hasLogo ? ' hasLogo' : ''}`}>
        {image || monogram}
      </div>
    );
  }

  if (hasLogo) {
    return <img className={small ? 'brandLogo small' : 'brandLogo'} src={logoSrc} alt={cafe} />;
  }

  return (
    <div className={small ? 'logo small' : 'logo'}>
      <b>L</b>
      {!small && <span>Liberte</span>}
    </div>
  );
}
