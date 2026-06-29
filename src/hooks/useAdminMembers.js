import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAdminMemberSync, loadAdminMembersSlice, pickAdminMemberList } from '../lib/adminMemberSync.js';
import { usePageActive } from './usePageActive.js';
import { getAuthEpoch } from '../lib/session.js';
import { canAttempt, recordSuccess, recordFailure } from '../lib/backgroundCircuit.js';

// Admin üye listesi için devre kesici anahtarı — 503 fırtınasını durdurur
const ADMIN_MEMBERS_CIRCUIT = 'admin-members';

// Yönetici paneli — üye listesi ayrı state (db sync ezmesinden bağımsız)
export function useAdminMembers({ enabled = false, commit, session = null, db = null }) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const active = usePageActive();

  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  // Uçuştaki istek — eşzamanlı çağrıları (poll + tab + realtime) tek isteğe indir
  const inFlightRef = useRef(null);

  const pullMembers = useCallback(async ({ manual = false } = {}) => {
    if (!commit) return false;

    // Uçuşta bir istek varsa onu paylaş — aynı anda 4 admin-members isteği başlamaz
    if (inFlightRef.current) return inFlightRef.current;

    // Devre açıksa (art arda 503/hata) arka plan denemesini atla — retry storm engeli.
    // Manuel yenilemede (kullanıcı aksiyonu) devre baypas edilir.
    if (!manual && !canAttempt(ADMIN_MEMBERS_CIRCUIT)) return false;

    // İstek başındaki oturum nesli — yanıt geç gelirse (logout/login) yok sayılır
    const epochAtStart = getAuthEpoch();
    setStatus('loading');
    setError('');

    const task = (async () => {
      try {
        const slice = await loadAdminMembersSlice(sessionRef.current);
        // Oturum değiştiyse eski admin-customers yanıtı yeni state'i (login ekranı) ezmesin
        if (getAuthEpoch() !== epochAtStart) return false;
        recordSuccess(ADMIN_MEMBERS_CIRCUIT);
        setMembers(slice.customers || []);
        applyAdminMemberSync(commit, slice, sessionRef.current);
        setStatus('ready');
        return true;
      } catch (e) {
        // Başarısızlık devre sayacını artırır → 3 hatadan sonra 60sn skip
        recordFailure(ADMIN_MEMBERS_CIRCUIT);
        // Logout/login sonrası gelen 401/500 hatası login UI'ı bozmasın
        if (getAuthEpoch() !== epochAtStart) return false;
        setError(e?.message || 'Üye listesi yüklenemedi');
        setStatus('error');
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = task;
    return task;
  }, [commit]);

  useEffect(() => {
    if (!enabled || !commit) {
      setMembers([]);
      setStatus('idle');
      setError('');
      return undefined;
    }

    // Sayfa arka plandayken/gizliyken polling yapma (egress + pil tasarrufu).
    // Ön plana dönünce effect yeniden çalışıp anında bir kez çeker.
    if (!active) return undefined;

    // Üye listesi büyük olabilir; sık çekmek egress'i şişirir.
    // Realtime değişiklikleri zaten tetikler, bu yüzden 60 sn yeterli.
    pullMembers();
    const timer = setInterval(pullMembers, 60_000);
    return () => clearInterval(timer);
  }, [enabled, active, commit, pullMembers, session?.adminVerified, session?.customerId]);

  // Tam state sync sonrası db'deki üyeleri de yansıt
  useEffect(() => {
    if (!enabled) return;
    const merged = pickAdminMemberList({
      adminMembers: members,
      adminMembersStatus: status,
      db
    });
    if (merged.length > members.length) {
      setMembers(merged);
    }
  }, [enabled, db, members, status]);

  return { members, status, error, refreshMembers: pullMembers };
}
