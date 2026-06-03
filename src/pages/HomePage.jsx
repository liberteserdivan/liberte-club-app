import { Coffee, Crown, Gift, QrCode, ShoppingBag, Sparkles } from 'lucide-react';
import Header from '../components/Header.jsx';
import { getGreeting, levelByStamps, productImageSrc } from '../lib/db.js';
import { DailyCampaignCard, InstallAppCard, Product } from '../components/Cards.jsx';
import DailyTasksStrip from '../components/DailyTasksStrip.jsx';

// Ana sayfa — özet kart ve keşif; tüm içerik tek ekranda değil
export default function HomePage({
  db, customer, card, setTab, setSession, sync,
  installPrompt, setInstallPrompt
}) {
  const best = db.items.filter((i) => i.best).slice(0, 4);
  const threshold = db.settings.stamp_threshold || 10;
  const stamps = card.totalStamps || 0;
  const rewards = card.availableRewards || 0;
  const progress = Math.min(100, (stamps / threshold) * 100);
  const missing = Math.max(0, threshold - stamps);
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);
  const greeting = getGreeting();

  return <section className="v4Home homePro">
    <div className="homeHeroPro">
      <Header db={db} customer={customer} setSession={setSession} sync={sync} />
      <div className="homeWelcome">
        <div>
          <p className="homeGreet">{greeting.label} {greeting.emoji}</p>
          <h1>{customer.name.split(' ')[0] || 'Liberte'}</h1>
          <div className="homeTimeBadge"><span>{greeting.time}</span><em>{greeting.tone}</em></div>
        </div>
        <div className="homeLevelPill"><Crown /><span>{level}</span></div>
      </div>
      <div className="homeLoyaltyStrip">
        <div><small>Damga</small><b>{stamps}<span>/{threshold}</span></b><em>{missing} kaldı</em></div>
        <div className="homeLoyaltyMain"><Coffee /><b>{rewards}</b><em>ikram hakkı</em></div>
        <div><small>Toplam</small><b>{card.lifetimeStamps || 0}</b><em>lifetime</em></div>
      </div>
      <div className="homeHeroProgress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    </div>

    <div className="homeBody">
      <InstallAppCard installPrompt={installPrompt} setInstallPrompt={setInstallPrompt} />

      <DailyTasksStrip db={db} customer={customer} setTab={setTab} />

      <div className="homeSection">
        <p className="homeSectionLabel">Sadakat kartın</p>
        <div className="v4MemberCard homeWalletCard">
          <div>
            <span>LIBERTE CLUB</span>
            <h2>Sadakat Kartı</h2>
            <p>{stamps}/{threshold} damga · {rewards} ödül · {db.settings.reward_description || '1 Bedava İçecek'}</p>
          </div>
          <Crown />
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="memberBottom">
            <div><span>SEVİYE</span><b>{level}</b></div>
            <div><span>ÖDÜL</span><b>{rewards}</b></div>
            <div><span>TOPLAM</span><b>{card.lifetimeStamps || 0}</b></div>
          </div>
        </div>
        <div className="homePrimaryActions">
          <button type="button" className="homePrimaryBtn" onClick={() => setTab('qr')}><QrCode /> Kasada Göster</button>
          <button type="button" className="homePrimaryBtn ghost" onClick={() => setTab('menu')}><ShoppingBag /> Menüyü Gör</button>
        </div>
      </div>

      <div className="homeSection">
        <p className="homeSectionLabel">Diğer sayfalar</p>
        <div className="homeHubGrid">
          <button type="button" className="homeHubTile" onClick={() => setTab('wheel')}><Sparkles /><b>Şans Çarkı</b><span>Günde 1 çevirme</span></button>
          <button type="button" className="homeHubTile" onClick={() => setTab('campaign')}><Gift /><b>Kampanyalar</b><span>Ödüller & bonuslar</span></button>
        </div>
      </div>

      <DailyCampaignCard db={db} setTab={setTab} />

      <div className="homeSection">
        <div className="homeSubHead"><h3>Öne çıkanlar</h3><button type="button" className="homeLinkBtn" onClick={() => setTab('menu')}>Menü →</button></div>
        <div className="v4List homeFeaturedList">
          {best.map((i) => <Product key={i.id} item={i} />)}
        </div>
      </div>
    </div>
  </section>;
}
