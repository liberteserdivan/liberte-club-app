import { useState } from 'react';
import { DEFAULT_LOGO } from '../lib/constants.js';

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

  const image = showLogo && (
    <img
      className="brandMarkImg"
      src={logoSrc}
      alt={cafe}
      onError={() => setImgFailed(true)}
    />
  );

  if (login) {
    return (
      <div className="brandMark login">
        {image || monogram}
      </div>
    );
  }

  if (header || admin) {
    return (
      <div className={`brandMark${header ? ' header' : ' admin'}${showLogo ? ' hasLogo' : ''}`}>
        {image || monogram}
      </div>
    );
  }

  if (showLogo) {
    return <img className={small ? 'brandLogo small' : 'brandLogo'} src={logoSrc} alt={cafe} onError={() => setImgFailed(true)} />;
  }

  return (
    <div className={small ? 'logo small' : 'logo'}>
      <b>L</b>
      {!small && <span>Liberte</span>}
    </div>
  );
}
