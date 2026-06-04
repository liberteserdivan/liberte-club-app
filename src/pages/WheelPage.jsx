import { Sparkles } from 'lucide-react';
import { DailyRewardCard, FirstOrderBonusCard, LuckyWheelCard } from '../components/Cards.jsx';

// Şans çarkı — premium hero ve oyun kartları
export default function WheelPage({ db, customer, commit }) {
  return (
    <section className="wheelPro wheelPageEnter">
      <div className="wheelProHero">
        <span className="wheelProEyebrow">Liberte Club</span>
        <h1><Sparkles aria-hidden="true" /> Şans Çarkı</h1>
        <p>Günde bir kez çevir; damga, ikram veya sürpriz kazan.</p>
      </div>

      <div className="wheelProBody">
        <LuckyWheelCard db={db} customer={customer} commit={commit} />
        <DailyRewardCard db={db} customer={customer} commit={commit} />
        <FirstOrderBonusCard db={db} customer={customer} commit={commit} />
      </div>
    </section>
  );
}
