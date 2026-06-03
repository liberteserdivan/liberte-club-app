import { Crown } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { levelByStamps } from '../lib/db.js';

// Kasada gösterilecek QR sadakat kartı
export default function QrPage({ db, customer, card }) {
  const value = JSON.stringify({ type: 'liberte-customer', id: customer.id, phone: customer.phone });
  const threshold = db.settings.stamp_threshold || 10;
  const stamps = card.totalStamps || 0;
  const rewards = card.availableRewards || 0;
  const progress = Math.min(100, (stamps / threshold) * 100);
  const level = card.level || levelByStamps(card.lifetimeStamps || 0);

  return <section className="pageShell qrPage">
    <div className="walletCard">
      <div className="walletTop">
        <div><span>Liberte Club</span><h2>QR Sadakat Kartı</h2></div>
        <Crown />
      </div>
      <div className="walletUser">
        <b>{customer.name}</b>
        <span>{level} MEMBER</span>
      </div>
      <div className="walletMeta">
        <div><span>ÜYE NO</span><b>LC-{customer.id}</b></div>
        <div><span>SEVİYE</span><b>{level}</b></div>
        <div><span>TOPLAM</span><b>{card.lifetimeStamps || 0}</b></div>
      </div>
      <div className="walletQr">
        <QRCodeCanvas value={value} size={230} level="H" includeMargin />
      </div>
      <div className="walletProgress">
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <p>{stamps}/{threshold} damga · {rewards} ödül</p>
      </div>
      <div className="walletNote">Kasada bu QR kodu göster. Damgan Liberte Club hesabına işlensin.</div>
    </div>
  </section>;
}
