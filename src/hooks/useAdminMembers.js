import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAdminMemberSync, loadAdminMembersSlice, pickAdminMemberList } from '../lib/adminMemberSync.js';
import { usePageActive } from './usePageActive.js';
import { getAuthEpoch } from '../lib/session.js';
import { canAttempt, recordSuccess, recordFailure, resetCircuit } from '../lib/backgroundCircuit.js';

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
  const [fromSnapshot, setFromSnapshot] = useState(false);
  // Uçuştaki istek — eşzamanlı çağrıları (poll + tab + realtime) tek isteğe indir
  const inFlightRef = useRef(null);

  const pullMembers = useCallback(async ({ manual = false } = {}) => {
    if (!commit) return false;

    // Manuel yenilemede önceki in-flight'ı bırakıp taze istek aç
    if (manual) {
      inFlightRef.current = null;
      resetCircuit(ADMIN_MEMBERS_CIRCUIT);
    } else if (inFlightRef.current) {
      return inFlightRef.current;
    }

    // Devre açıksa arka plan denemesini atla — manuel baypas edilir
    if (!manual && !canAttempt(ADMIN_MEMBERS_CIRCUIT)) return false;

    const epochAtStart = getAuthEpoch();
    setStatus('loading');
    setError('');

    const task = (async () => {
      try {
        const slice = await loadAdminMembersSlice(sessionRef.current);
        if (getAuthEpoch() !== epochAtStart) return false;

        const isSnap = Boolean(slice?.fromSnapshot);
        setFromSnapshot(isSnap);
        // Snapshot başarı sayılmaz — circuit "sağlıklı" sanmasın
        if (!isSnap) recordSuccess(ADMIN_MEMBERS_CIRCUIT);

        setMembers(slice.customers || []);
        applyAdminMemberSync(commit, slice, sessionRef.current);
        setStatus('ready');
        return true;
      } catch (e) {
        recordFailure(ADMIN_MEMBERS_CIRCUIT);
        if (getAuthEpoch() !== epochAtStart) return false;
        setError(e?.message || 'Üye listesi yüklenemedi');
        setFromSnapshot(false);
        if (e?.code || e?.requestId) {
          console.info('[admin-members]', {
            code: e?.code || null,
            status: e?.httpStatus || null,
            requestId: e?.requestId || null,
            step: e?.step || null,
            timings: e?.timings || null
          });
        }
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
      setFromSnapshot(false);
      return undefined;
    }

    if (!active) return undefined;

    pullMembers();
    const timer = setInterval(pullMembers, 60_000);
    return () => clearInterval(timer);
  }, [enabled, active, commit, pullMembers, session?.isAdmin, session?.customerId]);

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

  return { members, status, error, fromSnapshot, refreshMembers: pullMembers };
}
