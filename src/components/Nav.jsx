import { createPortal } from 'react-dom';
import { Gift, Home, Menu as MenuIcon, ShieldCheck, Sparkles } from 'lucide-react';
import NavQrIcon from './NavQrIcon.jsx';

// Alt navigasyon — viewport altına sabitlenir
export default function Nav({ tab, setTab, admin, wheelDone }) {
  const items = [
    ['home', Home, 'Ana Sayfa'],
    ['menu', MenuIcon, 'Menü'],
    ['qr', NavQrIcon, 'QR'],
    ['wheel', Sparkles, 'Çark'],
    ['campaign', Gift, 'Fırsat']
  ];

  if (admin) items.push(['admin', ShieldCheck, 'Admin']);

  const bar = (
    <nav
      className={`liberteNav${admin ? ' has-admin' : ''}`}
      style={{ '--nav-cols': items.length }}
      aria-label="Ana menü"
    >
      {items.map(([id, Icon, label]) => (
        <button
          type="button"
          key={id}
          className={[
            tab === id ? 'active' : '',
            id === 'qr' ? 'nav-qr' : '',
            id === 'wheel' && wheelDone ? 'wheel-done' : ''
          ].filter(Boolean).join(' ')}
          onClick={() => setTab(id)}
          aria-label={label}
          aria-current={tab === id ? 'page' : undefined}
        >
          <span className="navIconWrap" aria-hidden="true">
            <Icon />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );

  return createPortal(bar, document.body);
}
