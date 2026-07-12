import { Home, UtensilsCrossed, QrCode, Gift, User } from 'lucide-react';

const ITEMS = [
  { id: 'home', label: 'Ana', Icon: Home },
  { id: 'menu', label: 'Menü', Icon: UtensilsCrossed },
  { id: 'qr', label: 'Kartım', Icon: QrCode },
  { id: 'campaign', label: 'Kampanya', Icon: Gift },
  { id: 'profile', label: 'Profil', Icon: User }
];

export default function NavBar({ tab, onChange }) {
  return (
    <nav className="navBar" aria-label="Ana gezinme">
      {ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={tab === id ? 'active' : ''}
          onClick={() => onChange(id)}
          data-testid={`nav-${id}`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </nav>
  );
}
