import { fetchAdminCustomers, fetchAdminCustomersStrict } from './realtimeFetch.js';
import { loadAdminSnapshot, mergeAdminSnapshotIntoDb, saveAdminSnapshot } from './adminFullSnapshot.js';

// Üye kayıtlarını id ile birleştir — liste asla kısalmasın
export function mergeCustomerRecordsById(...lists) {
  const map = new Map();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const id = Number(row?.id);
      if (!id) continue;
      map.set(id, map.has(id) ? { ...map.get(id), ...row } : row);
    }
  }

  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

// Yönetici için en güvenilir üye listesini seç
export function resolveAdminCustomers(db, ...extraLists) {
  const snapshot = loadAdminSnapshot()?.data?.customers || [];
  return mergeCustomerRecordsById(db?.customers, snapshot, ...extraLists);
}

// Sunucu dilimi boş veya eksikse snapshot ile geri yükle
export function restoreAdminMembersFromSnapshot(db, session) {
  if (!session?.isAdmin || !session?.adminVerified) return db;
  return mergeAdminSnapshotIntoDb(db, session);
}

// Hafif admin-customers yanıtını yerel state'e uygula
export function applyAdminMemberSlice(db, slice) {
  if (!Array.isArray(slice?.customers) || !slice.customers.length) return db;

  return {
    ...db,
    customers: resolveAdminCustomers(db, slice.customers),
    loyalty: { ...(db.loyalty || {}), ...(slice.loyalty || {}) }
  };
}

// Eski /api/state yanıtı tek üyelikse tam listeyi ezme
export function mergeAdminRemoteIntoDb(currentDb, remoteData, session) {
  if (!remoteData) return currentDb;
  if (!session?.isAdmin || !session?.adminVerified) return remoteData;

  const bestCustomers = resolveAdminCustomers(currentDb, remoteData.customers || []);

  return {
    ...remoteData,
    customers: bestCustomers,
    loyalty: {
      ...(remoteData.loyalty || {}),
      ...(currentDb?.loyalty || {})
    },
    customerNotes: {
      ...(remoteData.customerNotes || {}),
      ...(currentDb?.customerNotes || {})
    }
  };
}

// commit fonksiyonu ile güncel db üzerinde üye sync uygula
export function applyAdminMemberSync(commit, slice, session = null) {
  commit((currentDb) => {
    if (slice?.customers?.length) {
      const next = applyAdminMemberSlice(currentDb, slice);
      saveAdminSnapshot(next);
      return next;
    }
    return restoreAdminMembersFromSnapshot(
      currentDb,
      session || { isAdmin: true, adminVerified: true }
    );
  }, { skipRemote: true });
}

// Sunucudan tam üye listesini çek ve yerelde uygula
export async function syncAdminMembersFromServer(_db, commit, session = null) {
  const slice = await fetchAdminCustomers();
  if (!slice?.customers?.length) {
    let restored = false;
    commit((currentDb) => {
      const next = restoreAdminMembersFromSnapshot(
        currentDb,
        session || { isAdmin: true, adminVerified: true }
      );
      restored = next !== currentDb;
      return next;
    }, { skipRemote: true });
    return restored;
  }

  applyAdminMemberSync(commit, slice, session);
  return true;
}

// Üye listesini doğrudan sunucudan çek — hook için
export async function loadAdminMembersSlice(session = null) {
  try {
    return await fetchAdminCustomersStrict();
  } catch (error) {
    const snap = loadAdminSnapshot()?.data;
    if (snap?.customers?.length) {
      return {
        ok: true,
        customers: snap.customers,
        loyalty: snap.loyalty || {},
        count: snap.customers.length,
        fromSnapshot: true
      };
    }
    throw error;
  }
}
