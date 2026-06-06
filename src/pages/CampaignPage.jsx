import { Bell, Crown, Gift, Sparkles, Star } from 'lucide-react';

import PageShell from '../components/PageShell.jsx';

import PageSection from '../components/PageSection.jsx';

import {

  DailyCampaignCard,

  FullHistoryCard,

  GoogleReviewBonusCard,

  NotificationCenterCard,

  PushWelcomeBanner,

  ReferralCard,

  RewardsCenterCard,

  VipBenefitsCard

} from '../components/Cards.jsx';

import PremiumSection from '../components/PremiumSection.jsx';

import { levelByStamps, loyaltyTemplate, countTotalRewards, countTotalStamps, normalizeCategoryRewards, normalizeCategoryStamps } from '../lib/db.js';

import { StampRulesInline } from '../components/StampRulesCopy.jsx';



// Aktif kampanya listesini döndür

function activeCampaigns(db) {

  return (db.campaigns || []).filter((c) => c.active !== false);

}



// Kampanyalar — menü ile uyumlu premium düzen

export default function CampaignPage({ db, customer, commit }) {

  const card = db.loyalty[customer.id] || loyaltyTemplate(customer.id);

  const categoryStamps = normalizeCategoryStamps(card);

  const categoryRewards = normalizeCategoryRewards(card);

  const totalStamps = countTotalStamps(categoryStamps);

  const rewards = countTotalRewards(categoryRewards);

  const level = card.level || levelByStamps(card.lifetimeStamps || 0);

  const campaigns = activeCampaigns(db);



  return (

    <PageShell

      variant="campaign"

      eyebrow="Liberte Club"

      title="Fırsatlar & Ödüller"

      subtitle="Damga biriktir, bonus kazan, club avantajlarını keşfet."

      bodyClassName="campaignProBody"

      heroSlot={(

        <>

          <div className="campaignProStats pageProStats">

            <div>

              <strong>{totalStamps}</strong>

              <span>Damga</span>

            </div>

            <div>

              <strong>{rewards}</strong>

              <span>İkram</span>

            </div>

            <div>

              <strong><Crown aria-hidden="true" /></strong>

              <span>{level}</span>

            </div>

          </div>

          <StampRulesInline className="campaignProRules" />

        </>

      )}

    >

      {campaigns.length > 0 && (

        <PageSection title={<><Gift aria-hidden="true" /> Güncel kampanyalar</>} count={`${campaigns.length} aktif`}>

          <div className="campaignProRail">

            {campaigns.map((c) => (

              <article className="campaignProCard" key={c.id}>

                <span className="campaignProCardIcon">{c.emoji || '🎁'}</span>

                <div>

                  <b>{c.title}</b>

                  <p>{c.body}</p>

                </div>

              </article>

            ))}

          </div>

        </PageSection>

      )}



      <PushWelcomeBanner db={db} customer={customer} commit={commit} />

      <DailyCampaignCard db={db} setTab={null} />

      <RewardsCenterCard db={db} customer={customer} card={card} commit={commit} />



      <PremiumSection title="Bonus fırsatları" subtitle="Ekstra damga ve avantajlar" icon={Sparkles} defaultOpen>

        <GoogleReviewBonusCard db={db} customer={customer} commit={commit} compact />

        <ReferralCard db={db} customer={customer} />

      </PremiumSection>



      <PremiumSection title="Club avantajları" subtitle="Seviye ve üyelik ayrıcalıkları" icon={Star}>

        <VipBenefitsCard db={db} customer={customer} />

      </PremiumSection>



      <PremiumSection title="Hesabım" subtitle="Geçmiş ve bildirimler" icon={Bell}>

        <NotificationCenterCard db={db} customer={customer} />

        <FullHistoryCard db={db} customer={customer} />

      </PremiumSection>

    </PageShell>

  );

}

