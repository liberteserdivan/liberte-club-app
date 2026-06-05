import { Crown, Gift, QrCode, ShoppingBag, Sparkles } from 'lucide-react';

import PageSection from '../components/PageSection.jsx';

import LoyaltyTripleStamps from '../components/LoyaltyTripleStamps.jsx';

import LiberteMarkIcon from '../components/LiberteMarkIcon.jsx';

import FeaturedSlider from '../components/FeaturedSlider.jsx';

import { getGreeting, levelByStamps, stampCardProgress, countTotalStamps, countTotalRewards, normalizeCategoryStamps, normalizeCategoryRewards } from '../lib/db.js';

import { StampRulesInline } from '../components/StampRulesCopy.jsx';

import { DailyCampaignCard, InstallAppCard, PushWelcomeBanner } from '../components/Cards.jsx';

import DailyTasksStrip from '../components/DailyTasksStrip.jsx';

import CafeContactBar from '../components/CafeContactBar.jsx';



// Ana sayfa — özet kart ve keşif

export default function HomePage({

  db, customer, card, setTab, commit,

}) {

  const featured = db.items.filter((i) => i.best || i.featured).slice(0, 8);

  const categoryStamps = normalizeCategoryStamps(card);

  const categoryRewards = normalizeCategoryRewards(card);

  const totalStamps = countTotalStamps(categoryStamps);

  const rewards = countTotalRewards(categoryRewards);

  const progress = stampCardProgress(categoryStamps);

  const level = card.level || levelByStamps(card.lifetimeStamps || 0);

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

            <h1>{customer.name.split(' ')[0] || 'Liberte'}</h1>

            <div className="homeTimeBadge"><span>{greeting.time}</span><em>{greeting.tone}</em></div>

          </div>

          <div className="homeLevelPill"><Crown /><span>{level}</span></div>

        </div>

        <LoyaltyTripleStamps card={card} level={level} />

      </div>



      <div className="homeBody">

        <PushWelcomeBanner db={db} customer={customer} commit={commit} />

        <InstallAppCard />



        <DailyTasksStrip db={db} customer={customer} setTab={setTab} />



        <PageSection label="Hızlı erişim">

          <div className="homeHubGrid homeHubGrid--three">

            <button type="button" className="homeHubTile homeHubTile--primary" onClick={() => setTab('qr')}>

              <QrCode /><b>Kartım</b><span>Kasada göster</span>

            </button>

            <button type="button" className="homeHubTile" onClick={() => setTab('menu')}>

              <ShoppingBag /><b>Menü</b><span>Lezzetleri keşfet</span>

            </button>

            <button type="button" className="homeHubTile" onClick={() => setTab('wheel')}>

              <Sparkles /><b>Şans Çarkı</b><span>Günde 1 çevirme</span>

            </button>

            <button type="button" className="homeHubTile" onClick={() => setTab('campaign')}>

              <Gift /><b>Kampanyalar</b><span>Ödüller & bonuslar</span>

            </button>

          </div>

        </PageSection>



        <PageSection label="Sadakat kartın">

          <div className="v4MemberCard homeWalletCard">

            <div>

              <span>LIBERTE CLUB</span>

              <h2>Sadakat Kartı</h2>

              <p>{totalStamps} aktif damga · {rewards} ikram hakkı</p>

              <StampRulesInline className="homeWalletRules" />

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

        </PageSection>



        <DailyCampaignCard db={db} setTab={setTab} />



        <PageSection label="Bize ulaş">

          <CafeContactBar />

        </PageSection>



        <PageSection label="Öne çıkanlar" title="Menüden seç">

          <FeaturedSlider items={featured} onMenuClick={() => setTab('menu')} />

        </PageSection>

      </div>

    </section>

  );

}

