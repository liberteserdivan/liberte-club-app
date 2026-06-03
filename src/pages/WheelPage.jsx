import { DailyRewardCard, FirstOrderBonusCard, LuckyWheelCard } from '../components/Cards.jsx';

// Şans çarkı ve günlük oyun ödülleri
export default function WheelPage({ db, customer, commit }) {
  return <section className="pageShell wheelPage wheelPageEnter">
    <div className="pageHero">
      <span>LIBERTE CLUB</span>
      <h2>Şans Çarkı</h2>
      <p>Günde bir kez çevir; damga, ikram veya sürpriz kazan.</p>
    </div>
    <LuckyWheelCard db={db} customer={customer} commit={commit} />
    <DailyRewardCard db={db} customer={customer} commit={commit} />
    <FirstOrderBonusCard db={db} customer={customer} commit={commit} />
  </section>;
}
