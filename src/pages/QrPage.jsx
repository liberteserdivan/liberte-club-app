import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { levelByStamps } from '../lib/db.js';

// Kasada gösterilecek QR sadakat kartı
export default function QrPage({ db, customer, card }) {
  const [entered, setEntered] = useState(false);
  const value = JSON.stringify({ type: 'liberte-customer', id: customer.id, phone: customer.phone });
  const threshold = db.settings.stamp_threshold || 10;
  const stamps = card.totalStamps || 0;
  const rewards = card.availableRewards || 0;
  const remaining = Math.max(0, threshold - stamps);
  const progress = Math.min(100, (stamps / threshold) * 100);
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <section className={`qrPro qrPageEnter${entered ? ' isEntered' : ''}`}>
      <div className="qrProHero">
        <span className="qrProEyebrow">Liberte Club</span>
        <h1>Kasada Göster</h1>
        <p>QR kodunu kasiyere göster, damgan hesabına işlensin.</p>
      </div>

      <div className="qrProBody">
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
            <div><span>Damga</span><b>{stamps}/{threshold}</b></div>
            <div><span>Ödül</span><b>{rewards}</b></div>
          </div>

          <div className="qrPassProgress">
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
            <p>
              {remaining === 0
                ? 'Ödül hazır! Kasada QR ile kullanabilirsin.'
                : `${db.settings.reward_description || '1 Bedava İçecek'} hedefine ${remaining} damga kaldı`}
            </p>
          </div>

          <p className="qrPassTip">Ekran parlaklığını açık tut, kasada birkaç saniye göster.</p>
        </article>
      </div>
    </section>
  );
}
