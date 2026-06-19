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

const QR_FETCH_MS = 10000;
const QR_REFRESH_MS = 60_000;
const QR_LOADING_CAP_MS = 5000;
const QR_DUMMY_VALUE = 'LIBERTE-QR-TEST';

// QR debug modu — localStorage liberteQrDebug=1
function isQrDebugMode() {
  try {
    return import.meta.env.DEV || localStorage.getItem('liberteQrDebug') === '1';
  } catch {
    return import.meta.env.DEV;
  }
}

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
  const [qrDebug, setQrDebug] = useState(null);
  const [dummyQrOk, setDummyQrOk] = useState(false);
  const signedQrRequired = isSignedQrRequired();
  const showDebug = isQrDebugMode();

  useEffect(() => {
    if (!showDebug) return undefined;
    const t = setTimeout(() => setDummyQrOk(true), 300);
    return () => clearTimeout(t);
  }, [showDebug]);

  const refreshBusyRef = useRef(false);
  const abortRef = useRef(null);
  const requestGenRef = useRef(0);
  const qrValueRef = useRef('');
  const mountedRef = useRef(true);

  const lp = getLpCardView(card);
  const remaining = stampsRemaining(card);
  const progress = stampCardProgress(card);
  const level = lp.level;

  const refreshSignedQr = useCallback(async ({ isRefresh = false, force = false } = {}) => {
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

    if (refreshBusyRef.current && !force) return;

    if (force) {
      abortRef.current?.abort();
      refreshBusyRef.current = false;
      setQrError('');
      setQrRequestId('');
      setQrDebug(null);
    }

    refreshBusyRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = requestGenRef.current + 1;
    requestGenRef.current = gen;

    const hadQr = Boolean(qrValueRef.current);
    setQrStatus(isRefresh && hadQr ? 'refreshing' : 'loading');

    try {
      const issued = await fetchCustomerQrToken({
        signal: controller.signal,
        timeoutMs: QR_FETCH_MS
      });

      if (!mountedRef.current || gen !== requestGenRef.current) return;

      const nextValue = String(issued.qrPayload || formatSignedQrValue(issued.token)).trim();
      if (!nextValue || nextValue === 'liberte-qr:') {
        throw Object.assign(new Error('QR yanıtı boş.'), {
          requestId: issued.requestId,
          code: 'QR_INVALID_RESPONSE',
          httpStatus: issued.debug?.httpStatus,
          debug: issued.debug
        });
      }

      qrValueRef.current = nextValue;
      setQrValue(nextValue);
      setQrError('');
      setQrRequestId(issued.requestId || '');
      setQrDebug(issued.debug || null);
      setQrStatus('ready');
    } catch (error) {
      if (!mountedRef.current || gen !== requestGenRef.current) return;

      if (error?.name === 'AbortError') return;

      const ref = error?.requestId || '';
      const status = error?.httpStatus ? `HTTP ${error.httpStatus}` : '';
      const code = error?.code ? ` [${error.code}]` : '';
      const base = error?.message || 'QR yüklenemedi. Bağlantını kontrol edip tekrar dene.';
      const message = [base, status, code, ref ? `Ref: ${ref}` : ''].filter(Boolean).join(' ');
      setQrError(message);
      if (ref) setQrRequestId(ref);
      if (error?.debug) setQrDebug(error.debug);

      if (!hadQr) {
        qrValueRef.current = '';
        setQrValue('');
        setQrStatus('error');
      } else {
        setQrStatus('ready');
      }
    } finally {
      if (gen === requestGenRef.current) {
        refreshBusyRef.current = false;
      }
    }
  }, [customer.id, customer.phone, signedQrRequired]);

  useEffect(() => {
    mountedRef.current = true;
    const t = requestAnimationFrame(() => setEntered(true));
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(t);
    };
  }, []);

  useEffect(() => {
    refreshSignedQr();

    if (!signedQrRequired) return undefined;

    const timer = setInterval(() => {
      refreshSignedQr({ isRefresh: true });
    }, QR_REFRESH_MS);

    function onOnline() {
      if (!qrValueRef.current) refreshSignedQr({ force: true });
    }
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshSignedQr, signedQrRequired]);

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
  const showRetry = signedQrRequired && (qrStatus === 'error' || qrStatus === 'offline' || (!showQr && qrStatus !== 'loading'));
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
            <QRCodeCanvas value={String(qrValue)} size={196} level="H" includeMargin={false} />
          ) : (
            <div className="qrPassRetry">
              {showDebug && (
                <div className="qrPassDummy">
                  <p className="qrPassTip">Render testi (dummy)</p>
                  <QRCodeCanvas
                    value={QR_DUMMY_VALUE}
                    size={120}
                    level="H"
                    includeMargin={false}
                  />
                  <p className="qrPassRef">{dummyQrOk ? 'Dummy QR OK' : 'Dummy QR bekleniyor…'}</p>
                </div>
              )}
              <p className="qrPassTip">{statusHint}</p>
              {showRetry && (
                <button
                  type="button"
                  className="ghost qrRetryBtn"
                  onClick={() => refreshSignedQr({ force: true })}
                  disabled={qrStatus === 'loading'}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {qrStatus === 'loading' ? 'Yükleniyor…' : 'Tekrar Dene'}
                </button>
              )}
            </div>
          )}
        </div>

        {(qrRequestId || qrDebug) && (qrStatus === 'error' || showDebug) && (
          <div className="qrPassRef">
            {qrRequestId && <p>Ref: {qrRequestId}</p>}
            {qrDebug && (
              <p>
                {qrDebug.endpoint} · HTTP {qrDebug.httpStatus ?? '—'} · {qrDebug.durationMs ?? '—'}ms
                · Bearer {qrDebug.hasBearerToken ? 'var' : 'yok'}
                · token {qrDebug.hasQrToken ? 'var' : 'yok'}
              </p>
            )}
          </div>
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
