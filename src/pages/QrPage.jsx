import { useCallback, useEffect, useState } from 'react';
import { Crown, RefreshCw } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import PageShell from '../components/PageShell.jsx';
import CustomerQrScanner from '../components/CustomerQrScanner.jsx';
import MembershipTierCard from '../components/MembershipTierCard.jsx';
import {
  STAMP_CATEGORIES,
  getLpCardView,
  stampCardProgress,
  stampsRemaining,
  canRedeemLpReward,
  lpRewardStatusText
} from '../lib/db.js';
import { StampRulesInline } from '../components/StampRulesCopy.jsx';
import { CLUB_APP_NAME } from '../lib/constants.js';
import { fetchCustomerQrToken, formatSignedQrValue, isSignedQrRequired } from '../lib/qrClient.js';

// Kartım — müşteri QR gösterir, yönetici müşteri QR tarar
export default function QrPage({
  db,
  customer,
  card,
  commit,
  refreshRemote,
  isAdmin = false,
  adminVerified = false
}) {
  if (isAdmin && adminVerified) {
    return <CustomerQrScanner db={db} commit={commit} refreshRemote={refreshRemote} />;
  }

  // Yönetici müşteri modunda da kendi QR kartını görebilir
  return <CustomerQrCard customer={customer} card={card} history={db?.history || []} />;
}

// Müşteri sadakat kartı QR görünümü
function CustomerQrCard({ customer, card, history = [] }) {
  const [entered, setEntered] = useState(false);
  const [qrValue, setQrValue] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const signedQrRequired = isSignedQrRequired();

  const lp = getLpCardView(card);
  const remaining = stampsRemaining(card);
  const progress = stampCardProgress(card);
  const level = lp.level;

  const refreshSignedQr = useCallback(async () => {
    if (!signedQrRequired) {
      setQrValue(JSON.stringify({ type: 'liberte-customer', id: customer.id, phone: customer.phone }));
      setQrError('');
      return;
    }

    setQrLoading(true);
    try {
      const issued = await fetchCustomerQrToken();
      setQrValue(formatSignedQrValue(issued.token));
      setQrError('');
    } catch (error) {
      setQrValue('');
      setQrError('QR kodu yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    } finally {
      setQrLoading(false);
    }
  }, [customer.id, customer.phone, signedQrRequired]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    refreshSignedQr();
    if (!signedQrRequired) return undefined;

    const timer = setInterval(refreshSignedQr, 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshSignedQr, signedQrRequired]);

  return (
    <PageShell
      variant="qr"
      className={`qrPageEnter${entered ? ' isEntered' : ''}`}
      eyebrow={CLUB_APP_NAME}
      title="Kasada Göster"
      subtitle="QR kodunu kasiyere göster, Liberte Puan hesabına işlensin."
      bodyClassName="qrProBody"
    >
      <article className="qrPassCard">
        <div className="qrPassHead">
          <div>
            <span>LIBERTE PUAN</span>
            <strong>{customer.name}</strong>
          </div>
          <div className="qrPassLevel"><Crown aria-hidden="true" /> {level}</div>
        </div>

        <div className="qrPassFrame">
          <div className="qrPassPulse" aria-hidden="true" />
          {qrValue ? (
            <QRCodeCanvas value={qrValue} size={196} level="H" includeMargin={false} />
          ) : (
            <div className="qrPassRetry">
              <p className="qrPassTip">{qrError || (qrLoading ? 'QR hazırlanıyor…' : 'QR kodu bekleniyor…')}</p>
              {signedQrRequired && (
                <button type="button" className="ghost qrRetryBtn" onClick={refreshSignedQr} disabled={qrLoading}>
                  <RefreshCw size={16} aria-hidden="true" />
                  {qrLoading ? 'Yükleniyor…' : 'Tekrar dene'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="qrPassMeta">
          <div><span>Üye No</span><b>LC-{customer.id}</b></div>
          <div><span>Mevcut LP</span><b>{lp.lpBalance}</b></div>
          <div><span>Toplam Kazanılan LP</span><b>{lp.lpLifetime}</b></div>
        </div>

        <MembershipTierCard card={card} customer={customer} history={history} />

        <div className="qrPassRewardHead">
          <span>KAZANILABİLİR İKRAMLAR</span>
        </div>

        <div className="qrPassCategoryGrid">
          {STAMP_CATEGORIES.map((cat) => {
            const ready = canRedeemLpReward(card, cat.id);
            return (
              <div key={cat.id} className={ready ? 'isReady' : ''}>
                <span>{cat.redeemTitle}</span>
                <b>{cat.rewardCost} LP</b>
                <em>{lpRewardStatusText(card, cat)}</em>
              </div>
            );
          })}
        </div>

        <div className="qrPassProgress">
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <p>
            {lp.redeemable.length > 0
              ? 'Kullanılabilir ödülün var. Kasada QR ile kullandır.'
              : remaining === 0
                ? 'Bir sonraki ödül eşiğine ulaştın.'
                : `Bir sonraki ödüle ${remaining} LP kaldı`}
          </p>
          <StampRulesInline />
        </div>

        <p className="qrPassTip">
          {signedQrRequired
            ? 'QR kodu kısa sürede yenilenir. Kasada birkaç saniye göster.'
            : 'Ekran parlaklığını açık tut, kasada birkaç saniye göster.'}
        </p>
      </article>
    </PageShell>
  );
}
