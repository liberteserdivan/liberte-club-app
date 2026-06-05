import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanLine } from 'lucide-react';
import PageShell from './PageShell.jsx';
import StampCategoryPanel from './StampCategoryPanel.jsx';
import {
  STAMP_CATEGORIES,
  addCategoryStampToCustomer,
  checkInCustomer,
  countTotalRewards,
  countTotalStamps,
  loyaltyTemplate,
  norm,
  normalizeCategoryRewards,
  normalizeCategoryStamps,
  redeemCategoryRewardForCustomer
} from '../lib/db.js';

// QR metninden müşteriyi bul
function findCustomerFromQr(db, rawText) {
  const data = JSON.parse(rawText);
  if (data?.type !== 'liberte-customer') return null;

  return (db.customers || []).find(
    (c) => String(c.id) === String(data.id) || norm(c.phone) === norm(data.phone)
  ) || null;
}

// Kasiyer — müşteri QR tarama ve damga işlemleri
export default function CustomerQrScanner({ db, commit }) {
  const readerId = useId().replace(/:/g, '');
  const hostRef = useRef(null);
  const scannerRef = useRef(null);
  const startingRef = useRef(false);

  const [active, setActive] = useState(false);
  const [scanRequested, setScanRequested] = useState(false);
  const [found, setFound] = useState(null);
  const [msg, setMsg] = useState('');
  const [success, setSuccess] = useState(false);

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

  const onScanSuccess = useCallback((txt) => {
    try {
      const customer = findCustomerFromQr(db, txt);
      if (!customer) {
        setMsg('Müşteri bulunamadı.');
        return;
      }

      setFound(customer);
      setSuccess(true);
      setMsg('Müşteri bulundu!');
      stopScanner();
    } catch {
      setMsg('Geçerli Liberte QR kodu okut.');
    }
  }, [db, stopScanner]);

  // Kamera alanı DOM'da hazır olduktan sonra tarayıcıyı başlat
  const requestScan = useCallback(() => {
    if (startingRef.current) return;
    setFound(null);
    setSuccess(false);
    setMsg('Kamera açılıyor...');
    setActive(true);
    setScanRequested(true);
  }, []);

  useEffect(() => {
    if (!scanRequested) return undefined;

    let cancelled = false;

    async function bootScanner() {
      if (startingRef.current) return;
      startingRef.current = true;

      try {
        // Önceki oturum varsa kapat; ilk açılışta active durumunu bozma
        if (scannerRef.current) {
          await stopScanner();
          if (cancelled) return;
        }

        const host = hostRef.current;
        if (!host) {
          throw new Error('Kamera alanı hazır değil');
        }

        const scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;

        const backCam = cameras.find((c) => /back|rear|environment|arka/i.test(c.label));
        const cameraId = backCam?.id || cameras[0]?.id;

        const qrbox = (viewWidth, viewHeight) => {
          const size = Math.floor(Math.min(viewWidth, viewHeight) * 0.72);
          return { width: size, height: size };
        };

        await scanner.start(
          cameraId || { facingMode: 'environment' },
          { fps: 10, qrbox, aspectRatio: 1 },
          onScanSuccess
        );

        if (!cancelled) {
          setMsg('Müşteri kartını çerçeveye hizala.');
        }
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
  }, [scanRequested, readerId, onScanSuccess, stopScanner]);

  useEffect(() => () => {
    stopScanner();
  }, [stopScanner]);

  async function rescan() {
    await stopScanner();
    setFound(null);
    setSuccess(false);
    setMsg('');
    requestScan();
  }

  function addCategory(category) {
    if (!found) return;
    commit(addCategoryStampToCustomer(db, found.id, category, 1, 'QR kamera'));
    setMsg(`${STAMP_CATEGORIES.find((c) => c.id === category)?.label || category} damgası eklendi.`);
  }

  function removeCategory(category) {
    if (!found) return;
    commit(addCategoryStampToCustomer(db, found.id, category, -1, 'QR düzeltme'));
    setMsg(`${STAMP_CATEGORIES.find((c) => c.id === category)?.label || category} damgası silindi.`);
  }

  function redeemCategory(category) {
    if (!found) return;
    const catLabel = STAMP_CATEGORIES.find((c) => c.id === category)?.label || category;
    const ok = confirm(`${found.name} için 1 ${catLabel.toLowerCase()} ikramı kullanılsın mı?`);
    if (!ok) return;
    commit(redeemCategoryRewardForCustomer(db, found.id, category, 'QR kasiyer'));
    setMsg(`${catLabel} ikramı kullanıldı.`);
  }

  const loyalty = found ? (db.loyalty[found.id] || loyaltyTemplate(found.id)) : null;
  const categoryStamps = loyalty ? normalizeCategoryStamps(loyalty) : null;
  const categoryRewards = loyalty ? normalizeCategoryRewards(loyalty) : null;
  const totalStamps = categoryStamps ? countTotalStamps(categoryStamps) : 0;
  const totalRewards = categoryRewards ? countTotalRewards(categoryRewards) : 0;

  return (
    <PageShell
      variant="qr"
      eyebrow="Kasiyer"
      title="Müşteri QR Tara"
      subtitle="Müşterinin kartındaki QR kodu okut, damga veya ikram işle."
      heroSlot={!active && !found ? (
        <button type="button" className="goldBtn scanStartBtn scanStartBtn--hero" onClick={requestScan}>
          <ScanLine size={18} /> Kamerayı Aç
        </button>
      ) : null}
    >
      <div className="card scanPanelCard">
        <div className="scanPanelHead">
          <div>
            <span>OKUYUCU</span>
            <h3>{found ? 'Müşteri seçildi' : 'Kamera'}</h3>
          </div>
          {(active || found) && (
            <button type="button" className="ghost scanRescanBtn" onClick={rescan}>
              <ScanLine size={16} /> Yeniden Tara
            </button>
          )}
        </div>

        <div className={`scannerFrame${active ? '' : ' scannerFrame--hidden'}`}>
          <div ref={hostRef} id={readerId} className="qrReaderHost" />
          {active && (
            <div className="scannerOverlay" aria-hidden="true">
              <span className="scannerCorner tl" />
              <span className="scannerCorner tr" />
              <span className="scannerCorner bl" />
              <span className="scannerCorner br" />
              <span className="scannerLine" />
            </div>
          )}
        </div>

        <p className={`scanMsg${success ? ' isSuccess' : ''}`}>
          {msg || 'Müşteri QR gösterir → okut → kategori damgası veya ikram uygula.'}
        </p>

        {found && (
          <div className={`found rewardBox scanFoundCard${success ? ' scanFoundPop' : ''}`}>
            <div className="scanFoundTop">
              <div>
                <b>{found.name}</b>
                <span>{found.phone} · {found.email || 'mail yok'}</span>
              </div>
              <span className="scanFoundBadge">LC-{found.id}</span>
            </div>

            <div className="adminStats">
              <div><span>Damga</span><b>{totalStamps}</b></div>
              <div><span>İkram</span><b>{totalRewards}</b></div>
              <div><span>Kullanılan</span><b>{loyalty.usedRewards || 0}</b></div>
            </div>

            <StampCategoryPanel
              mode="cashier"
              categoryStamps={categoryStamps}
              categoryRewards={categoryRewards}
              onAdd={addCategory}
              onRemove={removeCategory}
              onRedeem={redeemCategory}
            />

            <div className="adminActions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  commit(checkInCustomer(db, found.id, 'Kasa QR check-in'));
                  setMsg('Check-in kaydedildi.');
                }}
              >
                Check-in kaydet
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
