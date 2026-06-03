import { LogOut } from 'lucide-react';
import Brand from './Brand.jsx';

// Üst bar: uygulama adı ve çıkış
export default function Header({ db, customer, setSession, sync }) {
  return <header>
    <div className="head">
      <Brand db={db} small />
      <div>
        <b>{db.settings.app_name}</b>
        <span>{customer.name} · {sync === 'cloud' ? 'Bulut kayıt' : 'Yerel kayıt'}</span>
      </div>
    </div>
    <button type="button" className="logout" onClick={() => setSession(null)}>
      <LogOut /><span>Çıkış</span>
    </button>
  </header>;
}
