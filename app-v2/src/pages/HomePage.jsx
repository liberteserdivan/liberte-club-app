import PageHero from '../components/PageHero.jsx';
import { CLUB_APP_NAME } from '../lib/constants.js';
import { getLpBalance } from '../services/stateService.js';

export default function HomePage({ customer, loyalty, loading }) {
  const lp = getLpBalance(loyalty);
  const level = loyalty?.level || 'Bronze';

  return (
    <div data-testid="home-page">
      <PageHero
        title={customer?.name ? `Merhaba, ${customer.name.split(' ')[0]}` : CLUB_APP_NAME}
        subtitle="Liberte Club sadakat dünyan"
      />
      <div className="card">
        <span className="muted">LIBERTE PUAN</span>
        <div className="lpBig">{loading && !loyalty ? '…' : lp} LP</div>
        <p className="muted">Seviye: {level}</p>
      </div>
      <div className="card">
        <b>Bugün ne yapmak istersin?</b>
        <p className="muted">Menüye bak, QR kartını göster veya kampanyaları incele.</p>
      </div>
    </div>
  );
}
