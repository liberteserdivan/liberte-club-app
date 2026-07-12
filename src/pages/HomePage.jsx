import { Crown, Gift, QrCode, ShoppingBag } from 'lucide-react';

import PageSection from '../components/PageSection.jsx';
import LoyaltyTripleStamps from '../components/LoyaltyTripleStamps.jsx';
import LiberteMarkIcon from '../components/LiberteMarkIcon.jsx';
import FeaturedSlider from '../components/FeaturedSlider.jsx';
import { getGreeting, levelByStamps, stampCardProgress, getLpCardView } from '../lib/db.js';
import { TIER_TONE } from '../lib/membershipTier.js';
import { DEVICE_APP_NAME } from '../lib/constants.js';
import { StampRulesInline } from '../components/StampRulesCopy.jsx';
import { DailyCampaignCard, InstallAppCard, PushWelcomeBanner } from '../components/Cards.jsx';
import DailyTasksStrip from '../components/DailyTasksStrip.jsx';
import CafeContactBar from '../components/CafeContactBar.jsx';

// Ana sayfa — özet kart ve keşif
export default function HomePage({
  db, customer, card, setTab, commit, pushBannerDeferred = false,
}) {
  const featured = db.items.filter((i) => i.best || i.featured).slice(0, 8);
  const lp = getLpCardView(card);
  const progress = stampCardProgress(card);
  const level = lp.level || levelByStamps(lp.lpLifetime);
  const tierTone = TIER_TONE[level] || 'bronze';
  const greeting = getGreeting();

  return (
    <section className="v4Home homePro">
      <div className="homeHeroPro">
        <div className="homeWelcome">
          <div>
            <p className="homeGreet">
              {greeting.label}
              {greeting.emoji === '☕'
                ? <LiberteMarkIcon size={18} className="homeGreetMark" />
                : ` ${greeting.emoji}`}
            </p>
            <h1>{String(customer?.name || '').trim().split(/\s+/)[0] || DEVICE_APP_NAME}</h1>
            <div className="homeTimeBadge"><span>{greeting.time}</span><em>{greeting.tone}</em></div>
          </div>
          <div className={`homeLevelPill homeLevelPill--${tierTone}`}><Crown /><span>{level}</span></div>
        </div>

        <LoyaltyTripleStamps
          card={card}
          level={level}
          lpLifetime={lp.lpLifetime}
          setTab={setTab}
        />
      </div>

      <div className="homeBody">
        <PushWelcomeBanner db={db} customer={customer} commit={commit} defer={pushBannerDeferred} />
        <InstallAppCard />

        <DailyTasksStrip db={db} customer={customer} commit={commit} setTab={setTab} />

        <PageSection label="Hızlı erişim">
          <div className="homeHubGrid homeHubGrid--three">
            <button type="button" className="homeHubTile homeHubTile--primary" onClick={() => setTab('qr')}>
              <QrCode /><b>Kartım</b><span>Kasada göster</span>
            </button>
            <button type="button" className="homeHubTile" onClick={() => setTab('menu')}>
              <ShoppingBag /><b>Menü</b><span>Lezzetleri keşfet</span>
            </button>
            <button type="button" className="homeHubTile" onClick={() => setTab('campaign')}>
              <Gift /><b>Kampanyalar</b><span>Ödüller & bonuslar</span>
            </button>
          </div>
        </PageSection>

        <PageSection label="Liberte Puan">
          <div className="v4MemberCard homeWalletCard">
            <div>
              <span>LIBERTE CLUB</span>
              <h2>Liberte Puan</h2>
              <p>{lp.lpBalance} LP · {lp.redeemable.length} kazanılabilir ikram</p>
              <StampRulesInline className="homeWalletRules" />
            </div>
            <Crown />
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="memberBottom">
              <div><span>SEVİYE</span><b>{level}</b></div>
              <div><span>ÖDÜL</span><b>{lp.redeemable.length}</b></div>
              <div><span>TOPLAM LP</span><b>{lp.lpLifetime}</b></div>
            </div>
          </div>
          <div className="homePrimaryActions">
            <button type="button" className="homePrimaryBtn" onClick={() => setTab('qr')}><QrCode /> Kasada Göster</button>
            <button type="button" className="homePrimaryBtn ghost" onClick={() => setTab('menu')}><ShoppingBag /> Menüyü Gör</button>
          </div>
        </PageSection>

        <DailyCampaignCard db={db} setTab={setTab} />

        <PageSection label="Bize ulaş">
          <CafeContactBar />
        </PageSection>

        <PageSection label="Öne çıkanlar">
          <FeaturedSlider items={featured} onMenuClick={() => setTab('menu')} />
        </PageSection>
      </div>
    </section>
  );
}
