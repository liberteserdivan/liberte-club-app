import {
  ClubStatusCard,
  CouponUseCard,
  DailyCampaignCard,
  FullHistoryCard,
  GoogleReviewBonusCard,
  NotificationCenterCard,
  ReferralCard,
  RewardsCenterCard,
  VipBenefitsCard
} from '../components/Cards.jsx';
import { loyaltyTemplate } from '../lib/db.js';

// Kampanyalar, ödüller ve hesap avantajları
export default function CampaignPage({ db, customer, commit }) {
  const card = db.loyalty[customer.id] || loyaltyTemplate(customer.id);

  return <section className="pageShell campaignPage">
    <div className="pageHero">
      <span>LIBERTE CLUB</span>
      <h2>Kampanyalar & Ödüller</h2>
      <p>Üyelere özel fırsatlar, bonus damgalar ve hesap avantajları.</p>
    </div>

    <DailyCampaignCard db={db} setTab={null} />
    <RewardsCenterCard db={db} customer={customer} card={card} commit={commit} />
    <GoogleReviewBonusCard db={db} customer={customer} commit={commit} compact />
    <ReferralCard db={db} customer={customer} />
    <VipBenefitsCard db={db} customer={customer} />
    <CouponUseCard db={db} customer={customer} commit={commit} />
    <ClubStatusCard db={db} customer={customer} />
    <FullHistoryCard db={db} customer={customer} />
    <NotificationCenterCard db={db} customer={customer} />

    {(db.campaigns || []).map((c) =>
      <div className="card campaign" key={c.id}>
        <span>{c.emoji || '🎁'}</span>
        <div><b>{c.title}</b><p>{c.body}</p></div>
      </div>
    )}

    <div className="card">
      <b>Seni özledik sistemi</b>
      <p>7 gün gelmeyen müşteriler için özel geri çağırma kampanyası admin panelinden yönetilebilir.</p>
    </div>
  </section>;
}
