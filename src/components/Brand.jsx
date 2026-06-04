import { useState } from 'react';
import { DEFAULT_LOGO } from '../lib/constants.js';

// Logo kutusu — arka plan görseli ile tam doldurma
function BrandLogoBox({ className, logoSrc, cafe, onFail, children }) {
  return (
    <div
      className={`${className} hasLogo`}
      style={{ '--brand-logo': `url("${String(logoSrc).replace(/"/g, '')}")` }}
      role="img"
      aria-label={cafe}
    >
      <img
        className="brandMarkProbe"
        src={logoSrc}
        alt=""
        onError={onFail}
      />
      {children}
    </div>
  );
}

// Kafe marka logosu veya varsayılan L monogramı
export default function Brand({ db, small = false, admin = false, header = false, login = false }) {
  const cafe = db.settings?.cafe_name || 'Liberte Gastro Cafe';
  const logoSrc = db.settings?.logo || DEFAULT_LOGO;
  const [imgFailed, setImgFailed] = useState(false);
  const showLogo = Boolean(logoSrc) && !imgFailed;

  const monogram = (
    <div className="brandMonogram" aria-hidden={showLogo}>
      <b>L</b>
    </div>
  );

  if (login) {
    if (showLogo) {
      return (
        <BrandLogoBox
          className="brandMark login"
          logoSrc={logoSrc}
          cafe={cafe}
          onFail={() => setImgFailed(true)}
        />
      );
    }
    return <div className="brandMark login">{monogram}</div>;
  }

  if (header || admin) {
    if (showLogo) {
      return (
        <BrandLogoBox
          className={`brandMark${header ? ' header' : ' admin'}`}
          logoSrc={logoSrc}
          cafe={cafe}
          onFail={() => setImgFailed(true)}
        />
      );
    }
    return (
      <div className={`brandMark${header ? ' header' : ' admin'}`}>
        {monogram}
      </div>
    );
  }

  if (showLogo) {
    return (
      <img
        className={small ? 'brandLogo small' : 'brandLogo'}
        src={logoSrc}
        alt={cafe}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className={small ? 'logo small' : 'logo'}>
      <b>L</b>
      {!small && <span>Liberte</span>}
    </div>
  );
}
