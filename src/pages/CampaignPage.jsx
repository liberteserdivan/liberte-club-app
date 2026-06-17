import { Bell, Gift, Sparkles } from 'lucide-react';

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
import { getLpCardView, levelByStamps, loyaltyTemplate } from '../lib/db.js';
import { CLUB_APP_NAME } from '../lib/constants.js';
import { StampRulesInline } from '../components/StampRulesCopy.jsx';

// Aktif kampanya listesini döndür
function activeCampaigns(db) {
  return (db.campaigns || []).filter((c) => c.active !== false);
}

// Kampanyalar — Liberte Puan odaklı premium düzen
export default function CampaignPage({ db, customer, commit, setTab }) {
  const card = db.loyalty[customer.id] || loyaltyTemplate(customer.id);
  const lp = getLpCardView(card);
  const level = lp.level || levelByStamps(lp.lpLifetime);
  const campaigns = activeCampaigns(db);

  return (
    <PageShell
      variant="campaign"
      eyebrow={CLUB_APP_NAME}
      title="Fırsatlar & Ödüller"
      subtitle="Liberte Puan biriktir, bonus kazan, club avantajlarını keşfet."
      bodyClassName="campaignProBody"
      heroSlot={
        <>
          <div className="campaignProStats pageProStats">
            <div>
              <strong>{lp.lpBalance}</strong>
              <span>LP Bakiye</span>
            </div>
            <div>
              <strong>{lp.redeemable.length}</strong>
              <span>Ödül</span>
            </div>
            <div>
              <strong>{level}</strong>
              <span>Seviye</span>
            </div>
          </div>
          <StampRulesInline className="campaignProRules stampRulesInline" />
        </>
      }
    >
      <PushWelcomeBanner db={db} customer={customer} commit={commit} />

      <PageSection label="Özet" tight>
        <RewardsCenterCard db={db} customer={customer} card={card} />
      </PageSection>

      <DailyCampaignCard db={db} setTab={setTab} />

      <PremiumSection title="Bonus fırsatları" subtitle="Ekstra LP ve avantajlar" icon={Sparkles} defaultOpen>
        <ReferralCard db={db} customer={customer} />
        <GoogleReviewBonusCard db={db} customer={customer} commit={commit} />
        <VipBenefitsCard db={db} customer={customer} />
      </PremiumSection>

      {campaigns.length > 0 ? (
        <PremiumSection title="Club kampanyaları" subtitle="Güncel duyurular" icon={Gift}>
          {campaigns.map((c) => (
            <div className="card campaignListCard" key={c.id}>
              <span>{c.emoji || '🎁'}</span>
              <div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            </div>
          ))}
        </PremiumSection>
      ) : (
        <PageSection label="Kampanyalar">
          <div className="card campaignEmptyCard">
            <Gift size={22} aria-hidden="true" />
            <p>Şu an aktif kampanya yok. Bildirimleri aç; yeni fırsatlardan haberdar ol.</p>
          </div>
        </PageSection>
      )}

      <PremiumSection title="Geçmiş & bildirimler" subtitle="LP hareketleri ve duyurular" icon={Bell}>
        <FullHistoryCard db={db} customer={customer} />
        <NotificationCenterCard db={db} customer={customer} />
      </PremiumSection>
    </PageShell>
  );
}
