import { createPortal } from 'react-dom';
import { DEFAULT_LOGO, CLUB_APP_NAME, BRAND_SLOGAN } from '../lib/constants.js';

// Soğuk açılış — yeşil zemin + logo (document.body portal, iPad clipping önlemi)
export default function AppSplash({ phase = 'visible' }) {
  if (phase === 'hidden') return null;

  return createPortal(
    <div className={`appSplash${phase === 'fade' ? ' appSplash--fade' : ''}`} aria-hidden="true">
      <div className="appSplashOrb appSplashOrb--mint" />
      <div className="appSplashOrb appSplashOrb--gold" />
      <div className="appSplashCore">
        <img className="appSplashLogo" src={DEFAULT_LOGO} alt="" decoding="async" />
        <p className="appSplashTag">{CLUB_APP_NAME}</p>
        <span className="appSplashSub">Gastro Cafe</span>
        <p className="appSplashSlogan">{BRAND_SLOGAN}</p>
      </div>
    </div>,
    document.body
  );
}
