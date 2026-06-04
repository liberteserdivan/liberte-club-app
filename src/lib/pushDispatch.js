// Push bildirimi gönder — uygulama içi kayıt + FCM
export async function dispatchPush(db, commit, { title, body, customerId = null }) {
  const tokens = (db.pushSubscriptions || []).map((x) => x.token).filter(Boolean);
  const createdAt = new Date().toLocaleString('tr-TR');
  const logId = Date.now();

  const notification = {
    id: logId,
    title,
    body,
    createdAt,
    ...(customerId ? { customerId } : {})
  };

  const next = {
    ...db,
    notifications: [notification, ...(db.notifications || [])],
    pushLog: [
      {
        id: logId,
        title,
        body,
        deviceCount: tokens.length,
        sent: 0,
        failed: 0,
        note: '',
        createdAt
      },
      ...(db.pushLog || [])
    ].slice(0, 30)
  };

  commit(next);

  if (!tokens.length) {
    return { ok: true, sent: 0, note: 'Kayıtlı cihaz yok. Bildirim uygulama içi kaydedildi.' };
  }

  try {
    const response = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, title, body })
    });
    const result = await response.json();
    const note = result.note || `${result.sent || 0} cihaza iletildi${result.failed ? `, ${result.failed} başarısız` : ''}.`;

    commit({
      ...next,
      pushLog: next.pushLog.map((row) => (
        row.id === logId
          ? { ...row, sent: result.sent || 0, failed: result.failed || 0, note }
          : row
      ))
    });

    return { ok: true, sent: result.sent || 0, note };
  } catch {
    return { ok: false, sent: 0, note: 'Uygulama içi kaydedildi. Push sunucusuna ulaşılamadı.' };
  }
}
