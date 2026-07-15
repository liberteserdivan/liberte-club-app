import { isAdminSessionVerified } from './session.js';
import { fetchAdminCustomers, fetchAdminCustomersStrict } from './realtimeFetch.js';
import { fetchAdminMembersList } from './adminMemberClient.js';
import { loadRemote } from './db.js';
import { loadAdminSnapshot, mergeAdminSnapshotIntoDb, saveAdminSnapshot } from './adminFullSnapshot.js';

// Telefonu üye eşleştirmesi için normalize et
function normalizeMemberPhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

// Relational kayıt mı — eski seed id'lerinden ayır
function isRelationalCustomerId(id) {
  return Number(id) >= 1_000_000_000;
}

// Aynı telefonda iki kayıt varsa sunucu/relational olanı seç
function preferAdminCustomerRecord(next, current) {
  const nextId = Number(next?.id);
  const currentId = Number(current?.id);
  const nextRel = isRelationalCustomerId(nextId);
  const currentRel = isRelationalCustomerId(currentId);

  if (nextRel && !currentRel) return true;
  if (currentRel && !nextRel) return false;
  if (Boolean(next?.isAdmin) && !Boolean(current?.isAdmin)) return true;
  if (!Boolean(next?.isAdmin) && Boolean(current?.isAdmin)) return false;
  return nextId > currentId;
}

// Üye listesini tekilleştir — kısa/eksik telefonluları düşürme; çakışmada relational tercih
export function dedupeCustomersByPhone(customers) {
  const byId = new Map();

  for (const row of customers || []) {
    const id = Number(row?.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || preferAdminCustomerRecord(row, existing)) {
      byId.set(id, row);
    }
  }

  const byPhone = new Map();
  const result = [];

  for (const row of byId.values()) {
    const phone = normalizeMemberPhone(row?.phone);
    if (phone.length < 10) {
      result.push(row);
      continue;
    }

    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, row);
      result.push(row);
      continue;
    }

    if (preferAdminCustomerRecord(row, existing)) {
      const idx = result.indexOf(existing);
      if (idx >= 0) result[idx] = row;
      byPhone.set(phone, row);
    }
  }

  return result.sort((a, b) => Number(a.id) - Number(b.id));
}

// Yerel demo kayıtlarını üretim listesinden çıkar
export function isLocalSeedCustomer(row) {
  const id = Number(row?.id);
  if (id === 900001 || id === 900002) return true;

  const email = String(row?.email || '').trim().toLowerCase();
  return email === 'demo.customer@liberte.cafe' || email === 'demo.admin@liberte.cafe';
}

// Sunucu listesi varsa onu esas al; yoksa yedek kaynakları birleştir
export function finalizeAdminMemberCustomers(serverCustomers, ...fallbackLists) {
  const canonical = dedupeCustomersByPhone(serverCustomers || []);
  if (canonical.length) {
    return canonical.filter((row) => !isLocalSeedCustomer(row));
  }

  const merged = dedupeCustomersByPhone(
    mergeCustomerRecordsById(...fallbackLists.filter(Boolean))
  );
  return merged.filter((row) => !isLocalSeedCustomer(row));
}

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

// Yönetici için en güvenilir üye listesini seç — db birleştirme
export function resolveAdminCustomers(db, ...extraLists) {
  const snapshot = loadAdminSnapshot()?.data?.customers || [];
  const merged = mergeCustomerRecordsById(db?.customers, snapshot, ...extraLists);
  return dedupeCustomersByPhone(merged).filter((row) => !isLocalSeedCustomer(row));
}

// Sunucu dilimi boş veya eksikse snapshot ile geri yükle
export function restoreAdminMembersFromSnapshot(db, session) {
  if (!isAdminSessionVerified(session)) return db;
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
  if (!isAdminSessionVerified(session)) return remoteData;

  const bestCustomers = resolveAdminCustomers(currentDb, remoteData.customers || []);

  return {
    ...remoteData,
    customers: bestCustomers,
    loyalty: {
      ...(currentDb?.loyalty || {}),
      ...(remoteData.loyalty || {})
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

// Yönetici panelinde gösterilecek üye listesini seç
export function pickAdminMemberList({ adminMembers = [], adminMembersStatus = 'idle', db = null } = {}) {
  if (adminMembers.length > 0 && adminMembersStatus === 'ready') {
    return finalizeAdminMemberCustomers(adminMembers);
  }

  const snapshotCustomers = loadAdminSnapshot()?.data?.customers || [];
  const merged = finalizeAdminMemberCustomers([], adminMembers, db?.customers, snapshotCustomers);
  if (merged.length > 0) return merged;
  if (adminMembersStatus === 'ready') return [];

  return dedupeCustomersByPhone(db?.customers || []).filter((row) => !isLocalSeedCustomer(row));
}

// Tam admin state yanıtından üye dilimini çıkar
async function fetchMembersFromFullState() {
  const remote = await loadRemote();
  if (!remote?.data?.customers?.length) {
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

// Sunucu dilimi — snapshot ile karıştırma, yalnızca sunucu canonical
function finalizeAdminMemberSlice(slice) {
  const customers = finalizeAdminMemberCustomers(slice?.customers || []);
  if (!customers.length) {
    const snapshotCustomers = loadAdminSnapshot()?.data?.customers || [];
    const fallback = finalizeAdminMemberCustomers([], snapshotCustomers);
    if (!fallback.length) return null;

    return {
      ...slice,
      ok: true,
      customers: fallback,
      loyalty: loadAdminSnapshot()?.data?.loyalty || {},
      count: fallback.length,
      fromSnapshot: true
    };
  }

  return {
    ...slice,
    ok: true,
    customers,
    loyalty: slice?.loyalty || {},
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
