import { useState } from 'react';
import { DEFAULT_LOGO } from '../lib/constants.js';

// Marka logosu kaynağını çöz — boş veya geçersizse varsayılan
function resolveLogoSrc(settings) {
  const raw = String(settings?.logo || '').trim();
  if (!raw) return DEFAULT_LOGO;
  if (raw.startsWith('data:') && raw.length > 500000) return DEFAULT_LOGO;
  return raw;
}

// Logo kutusu — iç sarmalayıcı iOS’ta img hizasını sabitler
function BrandLogoBox({ className, logoSrc, cafe, onFail }) {
  return (
    <div className={`${className} hasLogo`}>
      <div className="brandMarkInner">
        <img
          className="brandMarkImg"
          src={logoSrc}
          alt={cafe}
          loading="eager"
          decoding="async"
          onError={onFail}
        />
      </div>
    </div>
  );
}

// Kafe marka logosu veya varsayılan L monogramı
export default function Brand({ db, small = false, admin = false, header = false, login = false }) {
  const cafe = db.settings?.cafe_name || 'Liberte Gastro Cafe';
  const logoSrc = resolveLogoSrc(db.settings);
  const [imgFailed, setImgFailed] = useState(false);
  const showLogo = !imgFailed;

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
