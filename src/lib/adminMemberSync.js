import { fetchAdminCustomers, fetchAdminCustomersStrict } from './realtimeFetch.js';
import { fetchAdminMembersList } from './adminMemberClient.js';
import { loadRemote } from './db.js';
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
    const finalized = finalizeAdminMemberSlice(slice) || slice;
    if (finalized?.customers?.length) {
      const next = applyAdminMemberSlice(currentDb, finalized);
      saveAdminSnapshot(next);
      return next;
    }
    return restoreAdminMembersFromSnapshot(
      currentDb,
      session || { isAdmin: true, adminVerified: true }
    );
  }, { skipRemote: true });
}

// Yönetici panelinde gösterilecek üye listesini seç — snapshot ile tek kayda düşme
export function pickAdminMemberList({ adminMembers = [], adminMembersStatus = 'idle', db = null } = {}) {
  const snapshotCustomers = loadAdminSnapshot()?.data?.customers || [];
  const merged = mergeCustomerRecordsById(snapshotCustomers, adminMembers, db?.customers || []);
  if (merged.length > 0) return merged;
  if (adminMembersStatus === 'ready') return [];
  return db?.customers || [];
}

// Tam admin state yanıtından üye dilimini çıkar
async function fetchMembersFromFullState() {
  const remote = await loadRemote();
  if (!remote?.adminVerified || !remote?.data?.customers?.length) {
    return null;
  }

  return {
    ok: true,
    customers: remote.data.customers,
    loyalty: remote.data.loyalty || {},
    count: remote.data.customers.length,
    fromState: true
  };
}

// Sunucu kaynaklarını sırayla dene — biri başarılı olunca birleştirilmiş listeyi döndür
async function fetchAdminMembersSliceFromServer() {
  const sources = [
    () => fetchAdminMembersList(),
    () => fetchAdminCustomersStrict(),
    () => fetchMembersFromFullState()
  ];

  let lastError = null;
  for (const source of sources) {
    try {
      const slice = await source();
      if (slice?.customers?.length) return slice;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

// Sunucu dilimi ile snapshot birleştir — liste asla kısalmaz
function finalizeAdminMemberSlice(slice) {
  const snapshotCustomers = loadAdminSnapshot()?.data?.customers || [];
  const customers = mergeCustomerRecordsById(snapshotCustomers, slice?.customers || []);
  if (!customers.length) return null;

  return {
    ...slice,
    ok: true,
    customers,
    loyalty: {
      ...(loadAdminSnapshot()?.data?.loyalty || {}),
      ...(slice?.loyalty || {})
    },
    count: customers.length
  };
}

// Sunucudan tam üye listesini çek ve yerelde uygula
export async function syncAdminMembersFromServer(_db, commit, session = null) {
  const slice = await fetchAdminMembersSliceFromServer().catch(() => fetchAdminCustomers());
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

  applyAdminMemberSync(commit, finalizeAdminMemberSlice(slice) || slice, session);
  return true;
}

// Üye listesini doğrudan sunucudan çek — hook için
export async function loadAdminMembersSlice(session = null) {
  try {
    const slice = await fetchAdminMembersSliceFromServer();
    const finalized = finalizeAdminMemberSlice(slice);
    if (finalized) return finalized;
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

  throw new Error('Üye listesi alınamadı');
}
