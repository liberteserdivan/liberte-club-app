import { Bell, Crown, Gift, Sparkles, Star } from 'lucide-react';
import {
  CouponUseCard,
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
import { levelByStamps, loyaltyTemplate } from '../lib/db.js';

// Aktif kampanya listesini döndür
function activeCampaigns(db) {
  return (db.campaigns || []).filter((c) => c.active !== false);
}

// Kampanyalar — menü ile uyumlu premium düzen
export default function CampaignPage({ db, customer, commit }) {
  const card = db.loyalty[customer.id] || loyaltyTemplate(customer.id);
  const threshold = db.settings?.stamp_threshold || 10;
  const stamps = card.totalStamps || 0;
  const rewards = card.availableRewards || 0;
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);
  const campaigns = activeCampaigns(db);

  return (
    <section className="campaignPro">
      <div className="campaignProHero">
        <span className="campaignProEyebrow">Liberte Club</span>
        <h1>Fırsatlar & Ödüller</h1>
        <p>Damga biriktir, bonus kazan, club avantajlarını keşfet.</p>

        <div className="campaignProStats">
          <div>
            <strong>{stamps}</strong>
            <span>Damga</span>
            <em>/{threshold}</em>
          </div>
          <div>
            <strong>{rewards}</strong>
            <span>Ödül</span>
          </div>
          <div>
            <strong><Crown aria-hidden="true" /></strong>
            <span>{level}</span>
          </div>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="campaignProSection">
          <div className="campaignProSectionHead">
            <h3><Gift aria-hidden="true" /> Güncel kampanyalar</h3>
            <em>{campaigns.length} aktif</em>
          </div>
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
        </div>
      )}

      <div className="campaignProBody">
        <DailyCampaignCard db={db} setTab={null} />
        <RewardsCenterCard db={db} customer={customer} card={card} commit={commit} />

        <PremiumSection title="Bonus fırsatları" subtitle="Ekstra damga ve avantajlar" icon={Sparkles} defaultOpen>
          <GoogleReviewBonusCard db={db} customer={customer} commit={commit} compact />
          <ReferralCard db={db} customer={customer} />
          <CouponUseCard db={db} customer={customer} commit={commit} />
        </PremiumSection>

        <PremiumSection title="Club avantajları" subtitle="Seviye ve üyelik ayrıcalıkları" icon={Star}>
          <VipBenefitsCard db={db} customer={customer} />
        </PremiumSection>

        <PremiumSection title="Hesabım" subtitle="Geçmiş ve bildirimler" icon={Bell}>
          <PushWelcomeBanner db={db} customer={customer} commit={commit} />
          <NotificationCenterCard db={db} customer={customer} />
          <FullHistoryCard db={db} customer={customer} />
        </PremiumSection>
      </div>
    </section>
  );
}
