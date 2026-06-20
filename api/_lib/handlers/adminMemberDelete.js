import { applyCors, publicErrorMessage, readBodySafe } from '../http.js';
import { requireAdminSession } from '../auth.js';
import { getSql } from '../sql.js';
import { useRelationalState } from '../relationalConfig.js';
import { deleteCustomerById } from '../customersStore.js';
import { bumpAppStateRevision } from '../relationalState.js';
import { invalidateAppStateCache } from '../appStateCache.js';
import { loadAppState, saveAppState } from '../appState.js';
import { deleteCustomerFromState } from '../stateAccess.js';
import { logServerError } from '../logServerError.js';

// Yönetici — üye silme (relational SQL veya legacy state)
export async function handleAdminMemberDelete(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAdminSession(req, res, { pinRequired: true, light: true });
  if (!session) return;

  try {
    const body = readBodySafe(req);
    const targetId = Number(body.customerId || body.customer_id || 0);
    if (!targetId) {
      return res.status(400).json({ ok: false, error: 'customerId gerekli' });
    }

    const sql = getSql();
    if (!sql) {
      return res.status(503).json({ ok: false, error: 'Veritabanı yapılandırması eksik' });
    }

    if (useRelationalState()) {
      await deleteCustomerById(sql, targetId);
      await bumpAppStateRevision(sql);
      invalidateAppStateCache();
      return res.status(200).json({ ok: true, customerId: targetId });
    }

    const remote = await loadAppState();
    if (!remote.data) {
      return res.status(404).json({ ok: false, error: 'Veri bulunamadı' });
    }

    const next = deleteCustomerFromState(remote.data, targetId);
    await saveAppState(next);
    return res.status(200).json({ ok: true, customerId: targetId });
  } catch (error) {
    await logServerError({
      source: 'admin.member-delete',
      error,
      customerId: session?.customerId || null
    });
    return res.status(500).json({ ok: false, error: publicErrorMessage(error, 'Üye silinemedi') });
  }
}
