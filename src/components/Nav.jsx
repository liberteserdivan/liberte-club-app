import { createPortal } from 'react-dom';
import { Gift, Home, Menu as MenuIcon, User } from 'lucide-react';
import NavQrIcon from './NavQrIcon.jsx';

// Alt menü — App Store uyumlu 5 sekme
export default function Nav({ tab, setTab, isAdmin = false }) {
  const items = [
    ['home', Home, 'Ana Sayfa'],
    ['menu', MenuIcon, 'Menü'],
    ['qr', NavQrIcon, isAdmin ? 'QR Tara' : 'Kartım'],
    ['campaign', Gift, 'Kampanyalar'],
    ['profile', User, 'Profil']
  ];

  const bar = (
    <nav
      className="liberteNav"
      style={{ '--nav-cols': items.length }}
      aria-label="Ana menü"
    >
      {items.map(([id, Icon, label]) => (
        <button
          type="button"
          key={id}
          data-testid={`nav-${id}`}
          className={[
            tab === id ? 'active' : '',
            id === 'qr' ? 'nav-qr' : ''
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
