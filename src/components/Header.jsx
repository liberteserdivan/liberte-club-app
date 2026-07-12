import { RefreshCw } from 'lucide-react';
import { CLUB_APP_NAME } from '../lib/constants.js';
import Brand from './Brand.jsx';

// Üst bar: logo ve senkron — çıkış yalnızca Profil > Hesap bölümünde
export default function Header({ db, customer, sync, refreshRemote }) {
  return <header className="appHeader">
    <div className="head">
      <Brand db={db} header />
      <div className="headText">
        <b>{db.settings.app_name || CLUB_APP_NAME}</b>
        <span>{customer?.name || 'Üye'} · {sync === 'cloud' ? 'Bulut senkron' : 'Yerel kayıt'}</span>
      </div>
    </div>
    {refreshRemote && (
      <div className="headActions">
        <button type="button" className="syncBtn" onClick={() => refreshRemote(true)} title="Verileri yenile" aria-label="Verileri yenile">
          <RefreshCw size={18} />
        </button>
      </div>
    )}
  </header>;
}
