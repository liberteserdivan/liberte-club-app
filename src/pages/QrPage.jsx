import { useCallback, useEffect, useRef, useState } from 'react';
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

const QR_FETCH_MS = 5000;
const QR_REFRESH_MS = 60_000;
const QR_LOADING_CAP_MS = 5000;

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

  return (
    <CustomerQrCard
      customer={customer}
      card={card}
      history={db?.history || []}
      refreshRemote={refreshRemote}
    />
  );
}

// Müşteri sadakat kartı QR görünümü
function CustomerQrCard({ customer, card, history = [], refreshRemote }) {
  const [entered, setEntered] = useState(false);
  const [qrValue, setQrValue] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrRequestId, setQrRequestId] = useState('');
  const [qrStatus, setQrStatus] = useState('idle');
  const signedQrRequired = isSignedQrRequired();

  const refreshBusyRef = useRef(false);
  const abortRef = useRef(null);
  const qrValueRef = useRef('');
  const mountedRef = useRef(true);

  const lp = getLpCardView(card);
  const remaining = stampsRemaining(card);
  const progress = stampCardProgress(card);
  const level = lp.level;

  const refreshSignedQr = useCallback(async ({ isRefresh = false } = {}) => {
    if (!signedQrRequired) {
      const legacy = JSON.stringify({ type: 'liberte-customer', id: customer.id, phone: customer.phone });
      qrValueRef.current = legacy;
      setQrValue(legacy);
      setQrError('');
      setQrStatus('ready');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setQrError('İnternet bağlantısı yok. QR kodu yüklenemedi.');
      setQrStatus(qrValueRef.current ? 'ready' : 'offline');
      return;
    }

    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const hadQr = Boolean(qrValueRef.current);
    setQrStatus(isRefresh && hadQr ? 'refreshing' : 'loading');

    try {
      const issued = await fetchCustomerQrToken({
        signal: controller.signal,
        timeoutMs: QR_FETCH_MS
      });
      if (!mountedRef.current) return;

      const nextValue = formatSignedQrValue(issued.token);
      qrValueRef.current = nextValue;
      setQrValue(nextValue);
      setQrError('');
      setQrRequestId(issued.requestId || '');
      setQrStatus('ready');
    } catch (error) {
      if (!mountedRef.current || error?.name === 'AbortError') return;

      const ref = error?.requestId || '';
      const base = error?.message || 'QR yüklenemedi. Bağlantını kontrol edip tekrar dene.';
      const message = ref ? `${base} Ref: ${ref}` : base;
      setQrError(message);
      if (ref) setQrRequestId(ref);

      if (!hadQr) {
        qrValueRef.current = '';
        setQrValue('');
        setQrStatus('error');
      } else {
        setQrStatus('ready');
      }
    } finally {
      refreshBusyRef.current = false;
    }
  }, [customer.id, customer.phone, signedQrRequired]);

  useEffect(() => {
    mountedRef.current = true;
    const t = requestAnimationFrame(() => setEntered(true));
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(t);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    refreshSignedQr();
    if (!signedQrRequired) return undefined;

    const timer = setInterval(() => {
      refreshSignedQr({ isRefresh: true });
    }, QR_REFRESH_MS);

    return () => clearInterval(timer);
  }, [refreshSignedQr, signedQrRequired]);

  // 5 sn sonra hâlâ QR yoksa fallback göster
  useEffect(() => {
    if (qrStatus !== 'loading') return undefined;

    const capTimer = setTimeout(() => {
      if (qrValueRef.current) return;
      setQrStatus('error');
      setQrError((prev) => prev || 'QR yüklenemedi. Bağlantını kontrol edip tekrar dene.');
    }, QR_LOADING_CAP_MS);

    return () => clearTimeout(capTimer);
  }, [qrStatus]);

  useEffect(() => {
    if (!refreshRemote) return undefined;

    refreshRemote(true);

    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      refreshRemote(true);
    }

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshRemote, customer.id]);

  const showQr = Boolean(qrValue) && qrStatus !== 'error';
  const showRetry = signedQrRequired && (qrStatus === 'error' || qrStatus === 'offline' || !showQr);
  const statusHint = qrError
    || (qrStatus === 'loading' ? 'QR hazırlanıyor…' : '')
    || (qrStatus === 'refreshing' ? 'QR yenileniyor…' : '')
    || (qrStatus === 'offline' ? 'Çevrimdışısın.' : '')
    || 'QR kodu bekleniyor…';

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

        <div className={`qrPassFrame${qrStatus === 'refreshing' ? ' isRefreshing' : ''}`}>
          <div className="qrPassPulse" aria-hidden="true" />
          {showQr ? (
            <QRCodeCanvas value={qrValue} size={196} level="H" includeMargin={false} />
          ) : (
            <div className="qrPassRetry">
              <p className="qrPassTip">{statusHint}</p>
              {showRetry && (
                <button
                  type="button"
                  className="ghost qrRetryBtn"
                  onClick={() => refreshSignedQr()}
                  disabled={qrStatus === 'loading'}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {qrStatus === 'loading' ? 'Yükleniyor…' : 'Tekrar Dene'}
                </button>
              )}
            </div>
          )}
        </div>

        {qrRequestId && qrStatus === 'error' && (
          <p className="qrPassRef">Ref: {qrRequestId}</p>
        )}

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
