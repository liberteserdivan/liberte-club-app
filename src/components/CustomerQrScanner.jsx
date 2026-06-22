import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Flashlight, ScanLine } from 'lucide-react';
import PageShell from './PageShell.jsx';
import PageSection from './PageSection.jsx';
import StampCategoryPanel from './StampCategoryPanel.jsx';
import CashierMembershipPanel from './CashierMembershipPanel.jsx';
import CashierProductPickModal from './CashierProductPickModal.jsx';
import {
  STAMP_CATEGORIES,
  addCategoryStampToCustomer,
  applyBirthdayCoffee,
  applyTierDiscount,
  checkInCustomer,
  getLpBalance,
  getLpLifetime,
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
import {
  bootInlineQrScanner,
  inlineScannerSupportsTorch,
  setInlineScannerTorch
} from '../lib/qrCameraBootstrap.js';
import { canUseNativeBarcodeScan, scanQrWithNativeCamera } from '../lib/nativeBarcodeScan.js';
import { isIos, isNativeApp } from '../lib/platform.js';
import {
  assertMenuItemCanEarnLp,
  requiresProductPickForLpCategory
} from '../lib/menuLp.js';

// QR metninden müşteriyi bul — yalnızca yerel geliştirme
function findCustomerFromLegacyQr(db, rawText) {
  try {
    const data = JSON.parse(rawText);
    if (data?.type !== 'liberte-customer') return null;

    return (db.customers || []).find(
      (c) => String(c.id) === String(data.id) || norm(c.phone) === norm(data.phone)
    ) || null;
  } catch {
    return null;
  }
}

// Kasiyer — müşteri QR tarama ve damga işlemleri
export default function CustomerQrScanner({ db, commit, refreshRemote }) {
  const readerId = useId().replace(/:/g, '');
  const hostRef = useRef(null);
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const decodeLockRef = useRef(false);
  const signedQrRequired = isSignedQrRequired();

  const [nativeScanReady, setNativeScanReady] = useState(false);
  const [active, setActive] = useState(false);
  const [scanRequested, setScanRequested] = useState(false);
  const [found, setFound] = useState(null);
  const [scannedToken, setScannedToken] = useState('');
  const [msg, setMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [productPickCategory, setProductPickCategory] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const dbRef = useRef(db);
  dbRef.current = db;

  const busy = scanBusy || actionBusy;

  // Tarama sonrası LP önbelleğini güncelle — güncel db ref kullan
  const syncScannedCustomer = useCallback((customer) => {
    if (!customer?.id || typeof commit !== 'function') return;
    setFound(customer);
    const current = dbRef.current;
    commit({
      ...current,
      loyalty: {
        ...(current.loyalty || {}),
        [customer.id]: customer.loyalty || current.loyalty?.[customer.id] || loyaltyTemplate(customer.id)
      }
    }, { skipRemote: true });
  }, [commit]);

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
    setTorchOn(false);
    setTorchAvailable(false);
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
    if (decodeLockRef.current || scanBusy || actionBusy) return;
    decodeLockRef.current = true;

    let scanOk = false;
    try {
      setScanBusy(true);
      const { customer, token } = await resolveCustomerFromScan(txt);
      syncScannedCustomer(customer);
      setScannedToken(token);
      setSuccess(true);
      setMsg('QR okundu!');
      await stopScanner();
      scanOk = true;
    } catch (error) {
      const message = error?.message || 'Geçerli Liberte QR kodu okut.';
      if (message.includes('PIN doğrulaması')) {
        setMsg('Yönetici PIN doğrulaması gerekli. Uygulamayı yeniden açıp PIN gir.');
      } else {
        setMsg(message);
      }
    } finally {
      setScanBusy(false);
      if (!scanOk) decodeLockRef.current = false;
    }
  }, [actionBusy, resolveCustomerFromScan, scanBusy, stopScanner, syncScannedCustomer]);

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
        setTorchAvailable(inlineScannerSupportsTorch(scanner));
        setMsg(isNativeApp() && isIos()
          ? 'QR kodu çerçeveye hizala. Zorlanırsan flaşı aç veya telefonu 15–20 cm uzakta tut.'
          : 'Müşteri kartını çerçeveye hizala.');
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
    decodeLockRef.current = false;
    await stopScanner();
    setFound(null);
    setScannedToken('');
    setSuccess(false);
    setMsg('');
    requestScan();
  }

  // Sunucu veya yerel state üzerinde sadakat işlemi — başarılıysa true
  async function runLoyaltyAction(action, category, menuItem = null) {
    if (!found || busy) return false;
    decodeLockRef.current = true;

    if (signedQrRequired && typeof navigator !== 'undefined' && !navigator.onLine) {
      setMsg('İnternet bağlantısı yok. LP işlemi kaydedilmedi.');
      return false;
    }

    if (signedQrRequired && scannedToken) {
      setActionBusy(true);
      try {
        const result = await postLoyaltyAction({
          token: scannedToken,
          action,
          category,
          menuItemId: menuItem?.id ?? null
        });
        if (result.customer) syncScannedCustomer(result.customer);
        else if (result.loyalty && found?.id) {
          const current = dbRef.current;
          commit({
            ...current,
            loyalty: { ...(current.loyalty || {}), [found.id]: result.loyalty }
          }, { skipRemote: true });
        }
        if (refreshRemote) void refreshRemote(true);
        return true;
      } catch (error) {
        setMsg(error?.message || 'İşlem yapılamadı');
        return false;
      } finally {
        setActionBusy(false);
      }
    }

    let nextDb = dbRef.current;

    if (action === 'stamp') {
      nextDb = addCategoryStampToCustomer(dbRef.current, found.id, category, 1, 'QR kamera', menuItem);
    } else if (action === 'remove') {
      nextDb = addCategoryStampToCustomer(dbRef.current, found.id, category, -1, 'QR düzeltme');
    } else if (action === 'redeem') {
      nextDb = redeemCategoryRewardForCustomer(dbRef.current, found.id, category, 'QR kasiyer');
    } else if (action === 'checkin') {
      nextDb = checkInCustomer(dbRef.current, found.id, 'Kasa QR check-in');
    } else if (action === 'tier_discount') {
      nextDb = applyTierDiscount(dbRef.current, found.id, 'QR kasiyer');
    } else if (action === 'birthday_coffee') {
      nextDb = applyBirthdayCoffee(dbRef.current, found.id, 'QR kasiyer');
    }

    if (nextDb === dbRef.current) return false;

    commit(nextDb);
    const updated = nextDb.customers?.find((c) => c.id === found.id);
    if (updated) setFound(updated);
    if (refreshRemote) void refreshRemote(true);
    return true;
  }

  async function confirmAddCategory(category, menuItem = null) {
    const ok = await runLoyaltyAction('stamp', category, menuItem);
    if (!ok) return;
    const cat = STAMP_CATEGORIES.find((c) => c.id === category);
    const itemNote = menuItem?.name ? ` (${menuItem.name})` : '';
    setMsg(`${cat?.label || category}${itemNote} için +${cat?.lpGain || 1} LP eklendi.`);
  }

  async function addCategory(category) {
    if (requiresProductPickForLpCategory(category, db.items || [])) {
      setProductPickCategory(category);
      return;
    }
    await confirmAddCategory(category);
  }

  async function handleProductPick(item) {
    const check = assertMenuItemCanEarnLp(item);
    if (!check.ok) {
      setMsg(check.error);
      setProductPickCategory(null);
      return;
    }
    setProductPickCategory(null);
    await confirmAddCategory(check.category, item);
  }

  async function removeCategory(category) {
    const ok = await runLoyaltyAction('remove', category);
    if (!ok) return;
    const cat = STAMP_CATEGORIES.find((c) => c.id === category);
    setMsg(`${cat?.label || category} için LP geri alındı.`);
  }

  async function redeemCategory(category) {
    const cat = STAMP_CATEGORIES.find((c) => c.id === category);
    const catLabel = cat?.label || category;
    const cost = cat?.rewardCost || 0;
    const ok = confirm(`${found.name} için ${cat?.rewardLabel || catLabel} ödülü (${cost} LP) kullanılsın mı?`);
    if (!ok) return;
    const done = await runLoyaltyAction('redeem', category);
    if (!done) return;
    setMsg(`${catLabel} ikram kullanıldı, -${cost} LP.`);
  }

  async function applyDiscount() {
    const membership = found?.membership;
    const pct = membership?.discountPercent || 0;
    const ok = confirm(`${found.name} için %${pct} seviye indirimi uygulansın mı?`);
    if (!ok) return;
    const done = await runLoyaltyAction('tier_discount');
    if (!done) return;
    setMsg(`%${pct} seviye indirimi kaydedildi.`);
  }

  async function applyBirthdayCoffeeAction() {
    const ok = confirm(`${found.name} için doğum günü kahve ikramı uygulansın mı?`);
    if (!ok) return;
    const done = await runLoyaltyAction('birthday_coffee');
    if (!done) return;
    setMsg('Doğum günü kahve ikramı kaydedildi.');
  }

  const loyaltySource = found ? (found.loyalty || db.loyalty?.[found.id]) : null;
  const loyalty = loyaltySource || (found ? loyaltyTemplate(found.id) : null);
  const lpBalance = loyalty ? getLpBalance(loyalty) : 0;
  const lpLifetime = loyalty ? getLpLifetime(loyalty) : 0;
  const redeemableCount = loyalty ? getRedeemableRewards(loyalty).length : 0;
  const memberRef = found ? `LC-${String(found.id).slice(-6)}` : '';
  const showInlineCamera = !nativeScanReady && active;
  const usesIosWebScanner = isNativeApp() && isIos() && !nativeScanReady;

  async function toggleTorch() {
    const scanner = scannerRef.current;
    if (!scanner || !torchAvailable) return;
    const next = !torchOn;
    const ok = await setInlineScannerTorch(scanner, next);
    if (ok) setTorchOn(next);
  }

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
            : usesIosWebScanner
              ? 'iOS sürümünde kamera açılır; QR kodu çerçevenin içine getir.'
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
              <div className="scanPanelActions">
                {torchAvailable && (
                  <button
                    type="button"
                    className={`ghost scanRescanBtn${torchOn ? ' isActive' : ''}`}
                    onClick={toggleTorch}
                    disabled={busy}
                  >
                    <Flashlight size={16} /> {torchOn ? 'Flaş açık' : 'Flaş'}
                  </button>
                )}
                <button type="button" className="ghost scanRescanBtn" onClick={rescan} disabled={busy}>
                  <ScanLine size={16} /> İptal
                </button>
              </div>
            )}
          </div>

          <p className={`scanMsg${success ? ' isSuccess' : ''}`}>
            {msg || (nativeScanReady
              ? 'Mağaza sürümünde native QR okuyucu kullanılır. Kamerayı aç ve müşteri kodunu okut.'
              : usesIosWebScanner
                ? 'Kamerayı aç, QR kodu çerçeveye hizala. Loş ortamda flaş düğmesini kullan.'
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
              <div><span>Mevcut LP</span><b>{lpBalance}</b></div>
              <div><span>Toplam LP</span><b>{lpLifetime}</b></div>
              <div><span>İkram</span><b>{redeemableCount}</b></div>
            </div>
          </PageSection>

          <CashierMembershipPanel
            card={loyalty}
            customer={found}
            history={db.history || []}
            busy={busy}
            onApplyDiscount={applyDiscount}
            onApplyBirthdayCoffee={applyBirthdayCoffeeAction}
          />

          <StampCategoryPanel
            mode="cashier"
            lpBalance={lpBalance}
            busy={actionBusy}
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
                const ok = await runLoyaltyAction('checkin');
                if (ok) setMsg('Check-in kaydedildi.');
              }}
            >
              Check-in kaydet
            </button>
          </div>
        </div>
      )}

      {productPickCategory && (
        <CashierProductPickModal
          lpCategory={productPickCategory}
          menuItems={db.items || []}
          onSelect={handleProductPick}
          onClose={() => setProductPickCategory(null)}
        />
      )}
    </PageShell>
  );
}
