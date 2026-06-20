import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, RefreshCw, ShieldCheck } from 'lucide-react';
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
import { fetchCustomerQrToken, formatSignedQrValue, isSignedQrRequired, parseQrExpiresAt } from '../lib/qrClient.js';
import { hasStoredAuthToken } from '../lib/apiClient.js';
import { isNativeApp } from '../lib/platform.js';
import { hydrateSessionTokenFromServer } from '../lib/session.js';

const QR_FETCH_MS = 6000;
const QR_LOADING_CAP_MS = 7000;
const QR_SIZE = 260;
const DEFAULT_TTL_SECONDS = 90;

// Geliştirme ortamında QR debug logları
function qrDevLog(...args) {
  if (import.meta.env.DEV) console.log(...args);
}

function qrDevError(...args) {
  if (import.meta.env.DEV) console.error(...args);
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

// Kalan geçerlilik süresini hesapla
function resolveSecondsLeft(expiresAt) {
  const exp = Number(expiresAt);
  if (!Number.isFinite(exp) || exp <= 0) return 0;
  return Math.max(0, Math.ceil((exp - Date.now()) / 1000));
}

// Müşteri sadakat kartı QR görünümü
function CustomerQrCard({ customer, card, history = [], refreshRemote }) {
  const [entered, setEntered] = useState(false);
  const [qrValue, setQrValue] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrRequestId, setQrRequestId] = useState('');
  const [qrStatus, setQrStatus] = useState('idle');
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const signedQrRequired = isSignedQrRequired();

  const refreshBusyRef = useRef(false);
  const abortRef = useRef(null);
  const requestGenRef = useRef(0);
  const qrValueRef = useRef('');
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef(null);
  const refreshSignedQrRef = useRef(null);

  const lp = getLpCardView(card);
  const remaining = stampsRemaining(card);
  const progress = stampCardProgress(card);
  const level = lp.level;

  const scheduleAutoRefresh = useCallback((expiresAt, ttlSeconds = DEFAULT_TTL_SECONDS) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const ttlMs = Math.max(15_000, Number(ttlSeconds) * 1000);
    const exp = Number(expiresAt) > 0 ? Number(expiresAt) : Date.now() + ttlMs;
    const delay = Math.max(3000, exp - Date.now() - 5000);

    refreshTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      refreshSignedQrRef.current?.({ isRefresh: true });
    }, delay);
  }, []);

  const refreshSignedQr = useCallback(async ({ isRefresh = false, force = false } = {}) => {
    if (!signedQrRequired) {
      const legacy = JSON.stringify({ type: 'liberte-customer', id: customer.id, phone: customer.phone });
      qrValueRef.current = legacy;
      setQrValue(legacy);
      setQrError('');
      setQrStatus('ready');
      setQrExpiresAt(0);
      setSecondsLeft(0);
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
      setQrError('');
      setQrRequestId('');
    }

    if (refreshBusyRef.current && !force) return;

    refreshBusyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = requestGenRef.current + 1;
    requestGenRef.current = gen;

    const hadQr = Boolean(qrValueRef.current);
    setQrStatus(isRefresh && hadQr ? 'refreshing' : 'loading');

    qrDevLog('[qr.frontend] start', {
      customerId: customer.id,
      sessionTokenExists: hasStoredAuthToken(),
      state: isRefresh && hadQr ? 'refreshing' : 'loading',
      force
    });

    if (!hasStoredAuthToken()) {
      await hydrateSessionTokenFromServer();
    }

    if (!hasStoredAuthToken()) {
      const msg = isNativeApp()
        ? 'Oturum tokenı bulunamadı. Çıkış yapıp tekrar giriş yapın.'
        : 'Oturum doğrulanamadı. Çıkış yapıp tekrar giriş yapın.';
      setQrError(msg);
      setQrStatus('error');
      refreshBusyRef.current = false;
      return;
    }

    try {
      const issued = await fetchCustomerQrToken({
        signal: controller.signal,
        timeoutMs: QR_FETCH_MS,
        customerId: customer.id
      });

      if (!mountedRef.current || gen !== requestGenRef.current) return;

      const nextValue = String(issued.qrPayload || issued.qrToken || formatSignedQrValue(issued.token)).trim();
      if (!nextValue || nextValue === 'liberte-qr:') {
        throw Object.assign(new Error('QR oluşturulamadı. Tekrar dene.'), {
          requestId: issued.requestId,
          code: 'QR_INVALID_RESPONSE',
          httpStatus: issued.debug?.httpStatus
        });
      }

      const expiresAt = issued.expiresAtMs || parseQrExpiresAt(issued.expiresAt, issued.ttlSeconds);

      qrValueRef.current = nextValue;
      setQrValue(nextValue);
      setQrError('');
      setQrRequestId('');
      setQrExpiresAt(expiresAt);
      setSecondsLeft(resolveSecondsLeft(expiresAt));
      setQrStatus('ready');
      scheduleAutoRefresh(expiresAt, issued.ttlSeconds);

      qrDevLog('[qr.frontend] render', {
        qrValueLength: nextValue.length,
        expiresAt,
        state: 'ready'
      });
    } catch (error) {
      qrDevError('[qr.frontend] error', error);
      if (!mountedRef.current || gen !== requestGenRef.current) return;
      if (error?.name === 'AbortError') return;

      const ref = error?.requestId || '';
      const message = error?.message || 'QR yüklenemedi. Bağlantını kontrol edip tekrar dene.';
      setQrError(message.includes('Ref:') ? message : (ref ? `${message} Ref: ${ref}` : message));
      if (ref) setQrRequestId(ref);

      if (!hadQr) {
        qrValueRef.current = '';
        setQrValue('');
        setQrExpiresAt(0);
        setSecondsLeft(0);
        setQrStatus('error');
      } else {
        setQrStatus('ready');
      }
    } finally {
      if (gen === requestGenRef.current) {
        refreshBusyRef.current = false;
      }
    }
  }, [customer.id, customer.phone, scheduleAutoRefresh, signedQrRequired]);

  useEffect(() => {
    refreshSignedQrRef.current = refreshSignedQr;
  }, [refreshSignedQr]);

  useEffect(() => {
    mountedRef.current = true;
    const t = requestAnimationFrame(() => setEntered(true));
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(t);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    refreshSignedQr();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [refreshSignedQr]);

  useEffect(() => {
    function onOnline() {
      if (!qrValueRef.current) refreshSignedQr({ force: true });
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshSignedQr]);

  useEffect(() => {
    if (!qrExpiresAt || qrStatus !== 'ready') return undefined;

    const tick = () => {
      const left = resolveSecondsLeft(qrExpiresAt);
      setSecondsLeft(left);
      if (left <= 0) refreshSignedQr({ isRefresh: true });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [qrExpiresAt, qrStatus, refreshSignedQr]);

  useEffect(() => {
    if (qrStatus !== 'loading') return undefined;

    const capTimer = setTimeout(() => {
      if (qrValueRef.current) return;
      setQrStatus('error');
      setQrError((prev) => prev || 'QR yüklenemedi. Bağlantını kontrol edip tekrar dene.');
    }, QR_LOADING_CAP_MS);

    return () => clearTimeout(capTimer);
  }, [qrStatus]);

  const hasQr = Boolean(qrValue);
  const isLoading = qrStatus === 'loading' && !hasQr;
  const isRefreshing = qrStatus === 'refreshing' && hasQr;
  const isError = qrStatus === 'error' || qrStatus === 'offline';
  const showRetry = isError || (!hasQr && qrStatus !== 'loading');

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

        <section className="qrPassStage" aria-label="Liberte QR kodu">
          <div className="qrPassStageHead">
            <span className="qrPassStageBadge"><ShieldCheck size={14} aria-hidden="true" /> Liberte QR</span>
            <h3>Kasada Okut</h3>
            <p>Kasiyere göster, puanın işlensin.</p>
          </div>

          <div className={`qrPassFrame${isRefreshing ? ' isRefreshing' : ''}${isLoading ? ' isLoading' : ''}`}>
            <div className="qrPassPulse" aria-hidden="true" />

            {hasQr && (
              <div className="qrPassCodeWrap">
                <QRCodeCanvas
                  value={String(qrValue)}
                  size={QR_SIZE}
                  level="M"
                  includeMargin
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
                {isRefreshing && (
                  <div className="qrPassRefreshOverlay" aria-live="polite">
                    <RefreshCw size={18} aria-hidden="true" />
                    <span>Yenileniyor…</span>
                  </div>
                )}
              </div>
            )}

            {isLoading && (
              <div className="qrPassLoading" aria-live="polite">
                <div className="qrPassSkeleton" aria-hidden="true" />
                <p>QR hazırlanıyor…</p>
              </div>
            )}

            {showRetry && !hasQr && (
              <div className="qrPassRetry">
                <p className="qrPassRetryTitle">QR yüklenemedi</p>
                <p className="qrPassRetryHint">
                  {qrError || 'Bağlantını kontrol edip tekrar dene.'}
                </p>
                <button
                  type="button"
                  className="ghost qrRetryBtn"
                  onClick={() => refreshSignedQr({ force: true })}
                  disabled={qrStatus === 'loading'}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {qrStatus === 'loading' ? 'Yükleniyor…' : 'Tekrar Dene'}
                </button>
                {qrRequestId && <p className="qrPassRef">Ref: {qrRequestId}</p>}
              </div>
            )}
          </div>

          {hasQr && qrStatus === 'ready' && (
            <p className="qrPassValidity">
              {secondsLeft > 0
                ? `Geçerlilik: ${secondsLeft} sn`
                : 'QR yenileniyor…'}
            </p>
          )}
        </section>

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
