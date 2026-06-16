import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import PageShell from './PageShell.jsx';
import PageSection from './PageSection.jsx';
import StampCategoryPanel from './StampCategoryPanel.jsx';
import {
  STAMP_CATEGORIES,
  addCategoryStampToCustomer,
  checkInCustomer,
  getLpBalance,
  getRedeemableRewards,
  loyaltyTemplate,
  norm,
  redeemCategoryRewardForCustomer
} from '../lib/db.js';
import {
  isSignedQrRequired,
  parseQrScanText,
  postLoyaltyAction,
  verifyCustomerQr
} from '../lib/qrClient.js';
import { bootInlineQrScanner } from '../lib/qrCameraBootstrap.js';
import { canUseNativeBarcodeScan, scanQrWithNativeCamera } from '../lib/nativeBarcodeScan.js';

// QR metninden müşteriyi bul — yalnızca yerel geliştirme
function findCustomerFromLegacyQr(db, rawText) {
  const data = JSON.parse(rawText);
  if (data?.type !== 'liberte-customer') return null;

  return (db.customers || []).find(
    (c) => String(c.id) === String(data.id) || norm(c.phone) === norm(data.phone)
  ) || null;
}

// Kasiyer — müşteri QR tarama ve damga işlemleri
export default function CustomerQrScanner({ db, commit, refreshRemote }) {
  const readerId = useId().replace(/:/g, '');
  const hostRef = useRef(null);
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const signedQrRequired = isSignedQrRequired();

  const [nativeScanReady, setNativeScanReady] = useState(false);
  const [active, setActive] = useState(false);
  const [scanRequested, setScanRequested] = useState(false);
  const [found, setFound] = useState(null);
  const [scannedToken, setScannedToken] = useState('');
  const [msg, setMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    canUseNativeBarcodeScan().then(setNativeScanReady).catch(() => setNativeScanReady(false));
  }, []);

  const stopScanner = useCallback(async () => {
    startingRef.current = false;
    if (!scannerRef.current) {
      setActive(false);
      return;
    }

    try {
      await scannerRef.current.stop();
      await scannerRef.current.clear();
    } catch {
      // Kamera zaten kapalı olabilir
    }

    scannerRef.current = null;
    setActive(false);
  }, []);

  const resolveCustomerFromScan = useCallback(async (txt) => {
    const parsed = parseQrScanText(txt);

    if (parsed.type === 'signed') {
      const customer = await verifyCustomerQr(parsed.token);
      return { customer, token: parsed.token };
    }

    if (parsed.type === 'legacy') {
      if (signedQrRequired) {
        throw new Error('Eski QR formatı artık geçerli değil. Müşteri ekranı yenilesin.');
      }
      const customer = findCustomerFromLegacyQr(db, txt);
      if (!customer) throw new Error('Müşteri bulunamadı.');
      return { customer, token: '' };
    }

    throw new Error('Geçerli Liberte QR kodu okut.');
  }, [db, signedQrRequired]);

  const onScanSuccess = useCallback(async (txt) => {
    try {
      setBusy(true);
      const { customer, token } = await resolveCustomerFromScan(txt);
      setFound(customer);
      setScannedToken(token);
      setSuccess(true);
      setMsg('Müşteri bulundu!');
      await stopScanner();
    } catch (error) {
      const message = error?.message || 'Geçerli Liberte QR kodu okut.';
      if (message.includes('PIN doğrulaması')) {
        setMsg('Yönetici PIN doğrulaması gerekli. Uygulamayı yeniden açıp PIN gir.');
      } else {
        setMsg(message);
      }
    } finally {
      setBusy(false);
    }
  }, [resolveCustomerFromScan, stopScanner]);

  // Native ML Kit — tam ekran kamera (Play Store güvenilir yol)
  const requestNativeScan = useCallback(async () => {
    if (startingRef.current || busy) return;
    startingRef.current = true;
    setFound(null);
    setScannedToken('');
    setSuccess(false);
    setMsg('Kamera açılıyor...');
    setActive(true);

    try {
      const rawValue = await scanQrWithNativeCamera();
      await onScanSuccess(rawValue);
    } catch (error) {
      const message = String(error?.message || '');
      if (/cancel/i.test(message) || /iptal/i.test(message)) {
        setMsg('Tarama iptal edildi.');
      } else {
        setMsg(message || 'QR okunamadı. Tekrar dene.');
      }
    } finally {
      startingRef.current = false;
      setActive(false);
    }
  }, [busy, onScanSuccess]);

  // Web — Html5Qrcode satır içi kamera
  const requestInlineScan = useCallback(() => {
    if (startingRef.current) return;
    setFound(null);
    setScannedToken('');
    setSuccess(false);
    setMsg('Kamera açılıyor...');
    setActive(true);
    setScanRequested(true);
  }, []);

  const requestScan = useCallback(() => {
    if (nativeScanReady) {
      void requestNativeScan();
      return;
    }
    requestInlineScan();
  }, [nativeScanReady, requestInlineScan, requestNativeScan]);

  useEffect(() => {
    if (!scanRequested || nativeScanReady) return undefined;

    let cancelled = false;

    async function bootScanner() {
      if (startingRef.current) return;
      startingRef.current = true;

      try {
        if (scannerRef.current) {
          await stopScanner();
          if (cancelled) return;
        }

        const host = hostRef.current;
        if (!host) {
          throw new Error('Kamera alanı hazır değil');
        }

        const scanner = await bootInlineQrScanner({
          elementId: readerId,
          onDecoded: (decoded) => { onScanSuccess(decoded); }
        });

        if (cancelled) {
          await scanner.stop().catch(() => {});
          await scanner.clear().catch(() => {});
          return;
        }

        scannerRef.current = scanner;
        setMsg('Müşteri kartını çerçeveye hizala.');
      } catch (error) {
        if (!cancelled) {
          setMsg(`Kamera açılamadı: ${error?.message || 'izin verilmedi'}`);
          await stopScanner();
        }
      } finally {
        startingRef.current = false;
        if (!cancelled) setScanRequested(false);
      }
    }

    bootScanner();

    return () => {
      cancelled = true;
    };
  }, [scanRequested, nativeScanReady, readerId, onScanSuccess, stopScanner]);

  useEffect(() => () => {
    stopScanner();
  }, [stopScanner]);

  async function rescan() {
    await stopScanner();
    setFound(null);
    setScannedToken('');
    setSuccess(false);
    setMsg('');
    requestScan();
  }

  // Sunucu veya yerel state üzerinde sadakat işlemi
  async function runLoyaltyAction(action, category) {
    if (!found || busy) return;

    if (signedQrRequired && scannedToken) {
      setBusy(true);
      try {
        const result = await postLoyaltyAction({ token: scannedToken, action, category });
        if (result.customer) setFound(result.customer);
        if (refreshRemote) await refreshRemote(true);
      } catch (error) {
        setMsg(error?.message || 'İşlem yapılamadı');
        return;
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'stamp') {
      commit(addCategoryStampToCustomer(db, found.id, category, 1, 'QR kamera'));
    } else if (action === 'remove') {
      commit(addCategoryStampToCustomer(db, found.id, category, -1, 'QR düzeltme'));
    } else if (action === 'redeem') {
      commit(redeemCategoryRewardForCustomer(db, found.id, category, 'QR kasiyer'));
    } else if (action === 'checkin') {
      commit(checkInCustomer(db, found.id, 'Kasa QR check-in'));
    }
  }

  async function addCategory(category) {
    await runLoyaltyAction('stamp', category);
    const cat = STAMP_CATEGORIES.find((c) => c.id === category);
    setMsg(`${cat?.label || category} için +${cat?.lpGain || 1} LP eklendi.`);
  }

  async function removeCategory(category) {
    await runLoyaltyAction('remove', category);
    const cat = STAMP_CATEGORIES.find((c) => c.id === category);
    setMsg(`${cat?.label || category} için LP geri alındı.`);
  }

  async function redeemCategory(category) {
    const cat = STAMP_CATEGORIES.find((c) => c.id === category);
    const catLabel = cat?.label || category;
    const cost = cat?.rewardCost || 0;
    const ok = confirm(`${found.name} için ${cat?.rewardLabel || catLabel} ödülü (${cost} LP) kullanılsın mı?`);
    if (!ok) return;
    await runLoyaltyAction('redeem', category);
    setMsg(`${catLabel} ikram kullanıldı, -${cost} LP.`);
  }

  const loyaltySource = found?.loyalty || (found ? db.loyalty[found.id] : null);
  const loyalty = loyaltySource || (found ? loyaltyTemplate(found.id) : null);
  const lpBalance = loyalty ? getLpBalance(loyalty) : 0;
  const redeemableCount = loyalty ? getRedeemableRewards(loyalty).length : 0;
  const memberRef = found ? `LC-${String(found.id).slice(-6)}` : '';
  const showInlineCamera = !nativeScanReady && active;

  return (
    <PageShell
      variant="qr"
      eyebrow={found ? 'Müşteri bulundu' : 'Kasiyer'}
      title={found ? found.name : 'Müşteri QR Tara'}
      subtitle={
        found
          ? `${memberRef} · ${found.phone}`
          : nativeScanReady
            ? 'Kamerayı aç, müşteri QR kodunu okut.'
            : 'Müşterinin kartındaki QR kodu okut, LP veya ödül işle.'
      }
      heroSlot={
        found ? (
          <button type="button" className="ghost scanRescanBtn scanRescanBtn--hero" onClick={rescan} disabled={busy}>
            <ScanLine size={16} /> Yeniden Tara
          </button>
        ) : !active ? (
          <button type="button" className="goldBtn scanStartBtn scanStartBtn--hero" onClick={requestScan} disabled={busy}>
            <ScanLine size={18} /> Kamerayı Aç
          </button>
        ) : null
      }
      bodyClassName={found ? 'qrScanResultBody' : ''}
    >
      <div className={`scannerFrame${showInlineCamera ? '' : ' scannerFrame--hidden'}`}>
        <div ref={hostRef} id={readerId} className="qrReaderHost" />
        {showInlineCamera && (
          <div className="scannerOverlay" aria-hidden="true">
            <span className="scannerCorner tl" />
            <span className="scannerCorner tr" />
            <span className="scannerCorner bl" />
            <span className="scannerCorner br" />
            <span className="scannerLine" />
          </div>
        )}
      </div>

      {!found ? (
        <div className="card scanPanelCard">
          <div className="scanPanelHead">
            <div>
              <span>OKUYUCU</span>
              <h3>{nativeScanReady ? 'Native Kamera' : 'Kamera'}</h3>
            </div>
            {showInlineCamera && (
              <button type="button" className="ghost scanRescanBtn" onClick={rescan} disabled={busy}>
                <ScanLine size={16} /> İptal
              </button>
            )}
          </div>

          <p className={`scanMsg${success ? ' isSuccess' : ''}`}>
            {msg || (nativeScanReady
              ? 'Play Store sürümünde native QR okuyucu kullanılır. Kamerayı aç ve müşteri kodunu okut.'
              : 'Müşteri QR gösterir → okut → LP ekle veya ödül kullandır.')}
          </p>
        </div>
      ) : (
        <div className={`scanResultCard${success ? ' scanFoundPop' : ''}`}>
          {msg && <p className="scanResultToast">{msg}</p>}

          {found.email && (
            <p className="scanResultEmail">{found.email}</p>
          )}

          <PageSection label="Özet" tight>
            <div className="scanResultStats">
              <div><span>Toplam LP</span><b>{lpBalance}</b></div>
              <div><span>Ödül</span><b>{redeemableCount}</b></div>
              <div><span>Kullanılan</span><b>{loyalty.usedRewards || 0}</b></div>
            </div>
          </PageSection>

          <StampCategoryPanel
            mode="cashier"
            lpBalance={lpBalance}
            onAdd={addCategory}
            onRemove={removeCategory}
            onRedeem={redeemCategory}
          />

          <div className="scanResultFooter">
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={async () => {
                await runLoyaltyAction('checkin');
                setMsg('Check-in kaydedildi.');
              }}
            >
              Check-in kaydet
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
