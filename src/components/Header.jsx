import { LogOut, RefreshCw } from 'lucide-react';
import Brand from './Brand.jsx';

// Üst bar: logo, senkron ve çıkış
export default function Header({ db, customer, setSession, sync, refreshRemote }) {
  return <header className="appHeader">
    <div className="head">
      <Brand db={db} header />
      <div className="headText">
        <b>{db.settings.app_name || 'Liberte Club'}</b>
        <span>{customer.name} · {sync === 'cloud' ? 'Bulut senkron' : 'Yerel kayıt'}</span>
      </div>
    </div>
    <div className="headActions">
      {refreshRemote && (
        <button type="button" className="syncBtn" onClick={() => refreshRemote(true)} title="Verileri yenile" aria-label="Verileri yenile">
          <RefreshCw size={18} />
        </button>
      )}
      <button type="button" className="logout" onClick={() => setSession(null)}>
        <LogOut /><span>Çıkış</span>
      </button>
    </div>
  </header>;
}
