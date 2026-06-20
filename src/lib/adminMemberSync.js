import { fetchAdminCustomers } from './realtimeFetch.js';
import { loadAdminSnapshot, saveAdminSnapshot } from './adminFullSnapshot.js';

// Slice üye sayısı mevcut/snapshot'tan azsa listeyi koru
function shouldApplyCustomerSlice(db, slice) {
  if (!Array.isArray(slice?.customers) || !slice.customers.length) return false;
  const incoming = slice.customers.length;
  const current = (db?.customers || []).length;
  const snap = loadAdminSnapshot()?.data?.customers?.length || 0;
  const best = Math.max(current, snap);
  return incoming >= best;
}

// Hafif admin-customers yanıtını yerel state'e uygula
export function applyAdminMemberSlice(db, slice) {
  if (!shouldApplyCustomerSlice(db, slice)) return db;
  return {
    ...db,
    customers: slice.customers,
    loyalty: { ...(db.loyalty || {}), ...(slice.loyalty || {}) }
  };
}

// Eski /api/state yanıtı tek üyelikse tam listeyi ezme
export function mergeAdminRemoteIntoDb(currentDb, remoteData, session) {
  if (!remoteData) return currentDb;
  if (!session?.isAdmin || !session?.adminVerified) return remoteData;

  const remoteCount = (remoteData.customers || []).length;
  const currentCount = (currentDb?.customers || []).length;
  const snapCount = loadAdminSnapshot()?.data?.customers?.length || 0;
  const bestCount = Math.max(currentCount, snapCount);

  if (remoteCount >= bestCount) return remoteData;

  return {
    ...remoteData,
    customers: currentCount ? currentDb.customers : (remoteData.customers || []),
    loyalty: {
      ...(remoteData.loyalty || {}),
      ...(currentDb?.loyalty || {})
    }
  };
}

// Sunucudan tam üye listesini çek ve yerelde uygula
export async function syncAdminMembersFromServer(db, commit) {
  const slice = await fetchAdminCustomers();
  if (!shouldApplyCustomerSlice(db, slice)) return false;

  const next = applyAdminMemberSlice(db, slice);
  commit(next, { skipRemote: true });
  saveAdminSnapshot(next);
  return true;
}
