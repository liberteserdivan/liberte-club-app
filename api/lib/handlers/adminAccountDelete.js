import { applyCors } from '../http.js';
import { destroySession, requireSession } from '../auth.js';
import { loadAppState, saveAppState } from '../appState.js';
import { deleteCustomerFromState } from '../stateAccess.js';

// Hesap silme — App Store uyumu
export async function handleAdminAccountDelete(req, res) {
  applyCors(req, res, 'POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await requireSession(req, res);
    if (!session) return;

    const remote = await loadAppState();
    if (!remote.data) return res.status(404).json({ error: 'Veri bulunamadı' });

    const customer = (remote.data.customers || []).find(
      (c) => Number(c.id) === Number(session.customerId)
    );
    if (!customer) return res.status(404).json({ error: 'Hesap bulunamadı' });

    if (customer.isAdmin) {
      const adminCount = (remote.data.customers || []).filter((c) => c.isAdmin).length;
      if (adminCount <= 1) {
        return res.status(403).json({ error: 'Son yönetici hesabı silinemez' });
      }
    }

    const next = deleteCustomerFromState(remote.data, session.customerId);
    next.history = [
      {
        id: Date.now(),
        customerId: session.customerId,
        name: customer.name,
        phone: customer.phone,
        type: 'customer_delete',
        count: 0,
        source: 'Kullanıcı hesap silme',
        createdAt: new Date().toLocaleString('tr-TR')
      },
      ...(next.history || [])
    ];

    await saveAppState(next);
    await destroySession(req, res);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Hesap silinemedi' });
  }
}
