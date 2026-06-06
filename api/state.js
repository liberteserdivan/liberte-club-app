import { applyCors, readBody } from './lib/http.js';
import { loadAppState, saveAppState } from './lib/appState.js';
import { requireAdminSession, requireSession } from './lib/auth.js';
import {
  filterStateForAdmin,
  filterStateForUser,
  findCustomerWriteViolations,
  mergeAdminState,
  mergeUserState
} from './lib/stateAccess.js';

export default async function handler(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Bulut veritabanı yapılandırılmadı', mode: 'local' });
  }

  try {
    if (req.method === 'GET') {
      const session = await requireSession(req, res);
      if (!session) return;

      const remote = await loadAppState();
      if (!remote.data) {
        return res.status(200).json({ data: null, updated_at: null, mode: 'cloud' });
      }

      const data = session.isAdmin && session.adminVerified
        ? filterStateForAdmin(remote.data)
        : filterStateForUser(remote.data, session.customerId);

      return res.status(200).json({
        data,
        updated_at: remote.updatedAt,
        mode: 'cloud',
        role: session.role,
        isAdmin: session.isAdmin,
        adminVerified: session.adminVerified
      });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const data = body?.data;
      if (!data) return res.status(400).json({ error: 'data zorunlu' });

      const session = await requireSession(req, res);
      if (!session) return;

      const remote = await loadAppState();
      const canonical = remote.data || data;

      // Admin yalnızca PIN doğrulamasıyla tam state yazabilir
      if (session.isAdmin) {
        const adminSession = await requireAdminSession(req, res, { pinRequired: true });
        if (!adminSession) return;
        await saveAppState(mergeAdminState(canonical, data));
        return res.status(200).json({ ok: true, mode: 'cloud' });
      }

      // Müşteri sadakat/ödül/yetki alanlarını değiştiremez → 403 + log
      const violations = findCustomerWriteViolations(canonical, data, session.customerId);
      if (violations.length) {
        console.warn('[api/state] Yetkisiz müşteri yazma denemesi engellendi', {
          customerId: session.customerId,
          fields: violations
        });
        return res.status(403).json({
          error: 'Bu veriyi değiştirme yetkin yok.',
          fields: violations
        });
      }

      // Müşteri yalnızca güvenli profil alanlarını günceller
      const merged = mergeUserState(canonical, data, session.customerId);
      await saveAppState(merged);
      return res.status(200).json({ ok: true, mode: 'cloud' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Database error' });
  }
}
