import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import PageShell from '../components/PageShell.jsx';
import CustomerQrScanner from '../components/CustomerQrScanner.jsx';
import {
  STAMP_CATEGORIES,
  levelByStamps,
  countTotalRewards,
  countTotalStamps,
  normalizeCategoryRewards,
  normalizeCategoryStamps,
  stampCardProgress,
  stampsRemaining
} from '../lib/db.js';
import { StampRulesInline } from '../components/StampRulesCopy.jsx';
import { CLUB_APP_NAME } from '../lib/constants.js';

// Kartım — müşteri QR gösterir, yönetici müşteri QR tarar
export default function QrPage({ db, customer, card, commit, isAdmin = false, adminVerified = false }) {
  if (isAdmin && adminVerified) {
    return <CustomerQrScanner db={db} commit={commit} />;
  }

  if (isAdmin && !adminVerified) {
    return null;
  }

  return <CustomerQrCard db={db} customer={customer} card={card} />;
}

// Müşteri sadakat kartı QR görünümü
function CustomerQrCard({ db, customer, card }) {
  const [entered, setEntered] = useState(false);
  const value = JSON.stringify({ type: 'liberte-customer', id: customer.id, phone: customer.phone });
  const categoryStamps = normalizeCategoryStamps(card);
  const categoryRewards = normalizeCategoryRewards(card);
  const totalStamps = countTotalStamps(categoryStamps);
  const rewards = countTotalRewards(categoryRewards);
  const remaining = stampsRemaining(categoryStamps);
  const progress = stampCardProgress(categoryStamps);
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <PageShell
      variant="qr"
      className={`qrPageEnter${entered ? ' isEntered' : ''}`}
      eyebrow={CLUB_APP_NAME}
      title="Kasada Göster"
      subtitle="QR kodunu kasiyere göster, damgan hesabına işlensin."
      bodyClassName="qrProBody"
    >
      <article className="qrPassCard">
        <div className="qrPassHead">
          <div>
            <span>SADAKAT KARTI</span>
            <strong>{customer.name}</strong>
          </div>
          <div className="qrPassLevel"><Crown aria-hidden="true" /> {level}</div>
        </div>

        <div className="qrPassFrame">
          <div className="qrPassPulse" aria-hidden="true" />
          <QRCodeCanvas value={value} size={196} level="H" includeMargin={false} />
        </div>

        <div className="qrPassMeta">
          <div><span>Üye No</span><b>LC-{customer.id}</b></div>
          <div><span>Damga</span><b>{totalStamps}</b></div>
          <div><span>İkram</span><b>{rewards}</b></div>
        </div>

        <div className="qrPassCategoryGrid">
          {STAMP_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <span>{cat.shortLabel}</span>
              <b>{categoryStamps[cat.id] || 0}/{cat.threshold}</b>
              <em>{categoryRewards[cat.id] || 0} ikram</em>
            </div>
          ))}
        </div>

        <div className="qrPassProgress">
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <p>
            {rewards > 0
              ? 'Kullanılabilir ikram hakkın var. Kasada QR ile kullan.'
              : remaining === 0
                ? 'Damga eşiği doldu, ikram hesabına işlendi.'
                : `En yakın ikrama ${remaining} damga kaldı`}
          </p>
          <StampRulesInline />
        </div>

        <p className="qrPassTip">Ekran parlaklığını açık tut, kasada birkaç saniye göster.</p>
      </article>
    </PageShell>
  );
}
