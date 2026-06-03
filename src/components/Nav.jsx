import { Gift, Home, Menu as MenuIcon, QrCode, ShieldCheck, Sparkles } from 'lucide-react';

// Alt navigasyon — çark doğrudan navbar'da
export default function Nav({ tab, setTab, admin, wheelDone }) {
  const items = [
    ['home', Home, 'Ana Sayfa'],
    ['menu', MenuIcon, 'Menü'],
    ['qr', QrCode, 'QR'],
    ['wheel', Sparkles, 'Çark'],
    ['campaign', Gift, 'Fırsat']
  ];

  if (admin) items.push(['admin', ShieldCheck, 'Admin']);

  return <nav
    className={`liberteNav${admin ? ' has-admin' : ''}`}
    style={{ '--nav-cols': items.length }}
    aria-label="Ana menü"
  >
    {items.map(([id, Icon, label]) =>
      <button
        type="button"
        key={id}
        className={[
          tab === id ? 'active' : '',
          id === 'qr' ? 'nav-qr' : '',
          id === 'wheel' && wheelDone ? 'wheel-done' : ''
        ].filter(Boolean).join(' ')}
        onClick={() => setTab(id)}
      >
        <Icon />
        <span>{label}</span>
      </button>
    )}
  </nav>;
}
