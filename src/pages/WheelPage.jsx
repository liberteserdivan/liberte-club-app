import { Sparkles } from 'lucide-react';
import PageShell from '../components/PageShell.jsx';
import PageSection from '../components/PageSection.jsx';
import { DailyRewardCard, FirstOrderBonusCard, LuckyWheelCard } from '../components/Cards.jsx';

// Şans çarkı — premium hero ve oyun kartları
export default function WheelPage({ db, customer, commit }) {
  return (
    <PageShell
      variant="wheel"
      className="wheelPageEnter"
      eyebrow="Liberte Club"
      title={<>Şans Çarkı <Sparkles aria-hidden="true" className="pageProTitleIcon" /></>}
      subtitle="Günde bir kez çevir; damga, ikram veya sürpriz kazan."
      bodyClassName="wheelProBody"
    >
      <PageSection label="Günlük oyun" tight>
        <LuckyWheelCard db={db} customer={customer} commit={commit} />
      </PageSection>

      <PageSection label="Ekstra kazançlar" tight>
        <div className="wheelRewardStack">
          <DailyRewardCard db={db} customer={customer} commit={commit} />
          <FirstOrderBonusCard db={db} customer={customer} commit={commit} />
        </div>
      </PageSection>
    </PageShell>
  );
}
