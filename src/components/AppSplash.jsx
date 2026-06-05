import { DEFAULT_LOGO } from '../lib/constants.js';

// Soğuk açılış — yeşil zemin + logo fade
export default function AppSplash({ phase = 'visible' }) {
  if (phase === 'hidden') return null;

  return (
    <div className={`appSplash${phase === 'fade' ? ' appSplash--fade' : ''}`} aria-hidden="true">
      <div className="appSplashOrb appSplashOrb--mint" />
      <div className="appSplashOrb appSplashOrb--gold" />
      <div className="appSplashCore">
        <img className="appSplashLogo" src={DEFAULT_LOGO} alt="" decoding="async" />
        <p className="appSplashTag">Liberte Club</p>
        <span className="appSplashSub">Gastro Cafe</span>
      </div>
    </div>
  );
}
