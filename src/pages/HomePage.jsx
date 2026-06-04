import { Crown, Gift, QrCode, ShoppingBag, Sparkles } from 'lucide-react';
import Header from '../components/Header.jsx';
import LoyaltyTripleStamps from '../components/LoyaltyTripleStamps.jsx';
import LiberteMarkIcon from '../components/LiberteMarkIcon.jsx';
import FeaturedSlider from '../components/FeaturedSlider.jsx';
import { getGreeting, levelByStamps, stampCardProgress, countTotalStamps, countTotalRewards, normalizeCategoryStamps, normalizeCategoryRewards, getStampRulesText } from '../lib/db.js';
import { DailyCampaignCard, InstallAppCard, PushWelcomeBanner } from '../components/Cards.jsx';
import DailyTasksStrip from '../components/DailyTasksStrip.jsx';

// Ana sayfa — özet kart ve keşif; tüm içerik tek ekranda değil
export default function HomePage({
  db, customer, card, setTab, setSession, sync, refreshRemote, commit,
  installPrompt, setInstallPrompt
}) {
  const featured = db.items.filter((i) => i.best || i.featured).slice(0, 8);
  const categoryStamps = normalizeCategoryStamps(card);
  const categoryRewards = normalizeCategoryRewards(card);
  const totalStamps = countTotalStamps(categoryStamps);
  const rewards = countTotalRewards(categoryRewards);
  const progress = stampCardProgress(categoryStamps);
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);
  const greeting = getGreeting();

  return <section className="v4Home homePro">
    <div className="homeHeroPro">
      <Header db={db} customer={customer} setSession={setSession} sync={sync} refreshRemote={refreshRemote} />
      <div className="homeWelcome">
        <div>
          <p className="homeGreet">
            {greeting.label}
            {greeting.emoji === '☕'
              ? <LiberteMarkIcon size={18} className="homeGreetMark" />
              : ` ${greeting.emoji}`}
          </p>
          <h1>{customer.name.split(' ')[0] || 'Liberte'}</h1>
          <div className="homeTimeBadge"><span>{greeting.time}</span><em>{greeting.tone}</em></div>
        </div>
        <div className="homeLevelPill"><Crown /><span>{level}</span></div>
      </div>
      <LoyaltyTripleStamps card={card} level={level} />
    </div>

    <div className="homeBody">
      <InstallAppCard installPrompt={installPrompt} setInstallPrompt={setInstallPrompt} />
      <PushWelcomeBanner db={db} customer={customer} commit={commit} />

      <DailyTasksStrip db={db} customer={customer} setTab={setTab} />

      <div className="homeSection">
        <p className="homeSectionLabel">Sadakat kartın</p>
        <div className="v4MemberCard homeWalletCard">
          <div>
            <span>LIBERTE CLUB</span>
            <h2>Sadakat Kartı</h2>
            <p>{totalStamps} aktif damga · {rewards} ikram hakkı</p>
            <small className="homeWalletRules">{getStampRulesText()}</small>
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
        <div className="homeSubHead"><h3>Öne çıkanlar</h3></div>
        <FeaturedSlider items={featured} onMenuClick={() => setTab('menu')} />
      </div>
    </div>
  </section>;
}
