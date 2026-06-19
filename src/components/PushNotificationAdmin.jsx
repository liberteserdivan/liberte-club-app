import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Smartphone, Trash2, Users } from 'lucide-react';
import { dispatchPush } from '../lib/pushDispatch.js';
import { apiFetch } from '../lib/apiClient.js';
import { sanitizePushSubscriptions } from '../lib/pushSubscriptionSanitize.js';
import {
  PUSH_AUDIENCE_OPTIONS,
  getAudienceOptionState,
  resolvePushAudience,
  resolvePushChannel
} from '../lib/pushAudience.js';

// Örnek bildirim şablonları
const PUSH_TEMPLATES = [
  {
    label: 'Genel',
    title: "Liberte'den Haber Var",
    body: 'Bugün kahvenin yanına tatlı keyfi seni bekliyor.',
    audience: 'all'
  },
  {
    label: 'Gold',
    title: 'Gold Üyelere Özel',
    body: 'Bugüne özel tatlı keyfini kaçırma.',
    audience: 'gold'
  },
  {
    label: 'Gelmeyenler',
    title: 'Liberte Seni Özledi',
    body: 'Son ziyaretinden beri yeni lezzetler eklendi.',
    audience: 'inactive_30d'
  },
  {
    label: 'LP 7+',
    title: 'İkramına Çok Yakınsın',
    body: "LP'lerini kullanarak kahve ikramını alabilirsin.",
    audience: 'lp_gte_7'
  }
];

// Admin — hedefli push bildirim gönderimi
export default function PushNotificationAdmin({ db, commit }) {
  const [title, setTitle] = useState("Liberte'den Haber Var");
  const [body, setBody] = useState('Bugün kahvenin yanına tatlı keyfi seni bekliyor.');
  const [audience, setAudience] = useState('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [cleanupNote, setCleanupNote] = useState('');
  const cleanupStarted = useRef(false);

  const devices = db.pushSubscriptions || [];
  const pushLog = db.pushLog || [];
  const preview = useMemo(() => resolvePushAudience(db, audience), [db, audience]);
  const audienceState = getAudienceOptionState(db, audience);

  // Eski/pasif/web kayıtları açılışta temizle
  useEffect(() => {
    if (cleanupStarted.current) return;
    cleanupStarted.current = true;

    async function runCleanup() {
      try {
        const response = await apiFetch('/api/admin?resource=push-cleanup', {
          method: 'POST',
          body: JSON.stringify({ mode: 'sanitize' })
        });
        const payload = await response.json().catch(() => ({}));

        if (response.ok && payload?.ok) {
          if (payload.removed > 0) {
            const cleaned = sanitizePushSubscriptions(db.pushSubscriptions || []);
            commit({ ...db, pushSubscriptions: cleaned.subscriptions });
            setCleanupNote(`${payload.removed} eski cihaz kaydı temizlendi.`);
          }
          return;
        }
      } catch {
        // Sunucu endpoint yoksa yerel temizliğe düş
      }

      const cleaned = sanitizePushSubscriptions(db.pushSubscriptions || []);
      if (!cleaned.summary.removed) return;

      commit({
        ...db,
        pushSubscriptions: cleaned.subscriptions
      });
      setCleanupNote(`${cleaned.summary.removed} eski cihaz kaydı temizlendi.`);
    }

    runCleanup();
  }, [db, commit]);

  function formatDeviceLabel(device) {
    const platform = device.platform === 'ios'
      ? 'iOS'
      : device.platform === 'android'
        ? 'Android'
        : 'Web';
    const channel = resolvePushChannel(device) === 'native' ? 'uygulama' : 'web';
    return `${platform} (${channel})`;
  }

  async function resetDevices() {
    const ok = confirm('Tüm bildirim cihaz kayıtları silinsin mi? Üyeler bildirimleri yeniden açmalı.');
    if (!ok) return;

    try {
      const response = await apiFetch('/api/admin?resource=push-cleanup', {
        method: 'POST',
        body: JSON.stringify({ mode: 'reset' })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok) {
        commit({ ...db, pushSubscriptions: [] });
        setCleanupNote('Tüm cihaz kayıtları sıfırlandı. Telefonda bildirimleri yeniden aç.');
        return;
      }
    } catch {
      // Yerel sıfırlama
    }

    commit({ ...db, pushSubscriptions: [] });
    setCleanupNote('Cihaz kayıtları temizlendi. Telefonda bildirimleri yeniden aç.');
  }

  async function sendPush() {
    if (!body.trim()) {
      alert('Mesaj zorunlu.');
      return;
    }

    if (preview.disabled) {
      alert(preview.disabledReason || 'Seçilen hedef kitle kullanılamıyor.');
      return;
    }

    const ok = confirm('Bu bildirim seçilen hedef kitleye gönderilecek. Devam etmek istiyor musunuz?');
    if (!ok) return;

    setSending(true);
    setResult(null);

    const response = await dispatchPush(db, commit, {
      title: title.trim(),
      body: body.trim(),
      audience
    });

    setResult({
      ok: response.ok,
      audienceLabel: preview.audienceLabel,
      targetUserCount: preview.targetUserCount,
      deviceCount: preview.deviceCount,
      sent: response.sent || 0,
      failed: response.failed || 0,
      invalidRemoved: response.removedInvalid || 0,
      note: response.note || '',
      requestId: response.requestId || null
    });
    setSending(false);
  }

  function removeDevice(id, token) {
    if (!confirm('Bu cihaz listeden kaldırılsın mı?')) return;
    commit({
      ...db,
      pushSubscriptions: devices.filter((row) => row.id !== id && row.token !== token)
    });
  }

  return (
    <div className="notificationAdmin">
      <div className="card adminSectionCard pushComposer pushComposerPro">
        <div className="adminSectionHead">
          <div><span>BİLDİRİM</span><h3>Bildirim Gönder</h3></div>
          <span className="deviceCountBadge">
            <Smartphone size={14} /> {preview.deviceCount} cihaz
          </span>
        </div>

        {cleanupNote && <p className="pushAudienceNote">{cleanupNote}</p>}

        <p className="pushHint">
          Kampanyalar, LP fırsatları ve ikram haklarından haberdar olmak için üyeler bildirim izni vermelidir.
          Gönderim sunucu üzerinden Firebase Admin SDK ile yapılır.
        </p>

        <label htmlFor="pushTitle">Başlık</label>
        <input
          id="pushTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Liberte'den Haber Var"
        />

        <label htmlFor="pushBody">Mesaj</label>
        <textarea
          id="pushBody"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bugün kahvenin yanına tatlı keyfi seni bekliyor."
          rows={3}
        />

        <label htmlFor="pushAudience">Hedef Kitle</label>
        <select
          id="pushAudience"
          className="pushAudienceSelect"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          {PUSH_AUDIENCE_OPTIONS.map((option) => {
            const state = getAudienceOptionState(db, option.id);
            return (
              <option key={option.id} value={option.id} disabled={state.disabled}>
                {option.label}{state.disabled ? ' — pasif' : ''}
              </option>
            );
          })}
        </select>

        {audienceState.disabled && (
          <p className="pushAudienceNote">{audienceState.reason}</p>
        )}

        <div className="pushReachStats">
          <div><Users size={14} aria-hidden="true" /><span>{preview.targetUserCount} üye</span></div>
          <div><Smartphone size={14} aria-hidden="true" /><span>{preview.deviceCount} kayıtlı cihaz</span></div>
        </div>

        <div className="pushPreview pushPreviewPro">
          <span>ÖNİZLEME</span>
          <b>{title.trim() || 'Başlık'}</b>
          <p>{body.trim() || 'Mesaj içeriği'}</p>
          <em>Hedef: {preview.audienceLabel}</em>
        </div>

        <div className="pushTemplates">
          {PUSH_TEMPLATES.map((item) => (
            <button
              type="button"
              key={item.label}
              className="ghost"
              onClick={() => {
                setTitle(item.title);
                setBody(item.body);
                setAudience(item.audience);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="goldBtn pushSendBtn"
          onClick={sendPush}
          disabled={sending || preview.disabled || preview.deviceCount === 0}
        >
          <Send size={18} /> {sending ? 'Gönderiliyor...' : 'Bildirimi Gönder'}
        </button>

        {preview.deviceCount === 0 && !preview.disabled && (
          <p className="pushAudienceNote">Seçilen hedef kitlede kayıtlı bildirim cihazı yok.</p>
        )}

        {result && (
          <div className={`pushSendResult${result.ok ? ' isSuccess' : ''}`}>
            <strong>{result.ok ? 'Bildirim gönderildi' : 'Gönderim tamamlanamadı'}</strong>
            <ul>
              <li>Hedef kitle: {result.audienceLabel}</li>
              <li>Ulaşılan / kayıtlı cihaz: {result.deviceCount}</li>
              <li>Başarılı gönderim: {result.sent}</li>
              <li>Başarısız token: {result.failed}</li>
              {result.invalidRemoved > 0 && (
                <li>Geçersiz token kaldırıldı: {result.invalidRemoved}</li>
              )}
            </ul>
            {result.note && <p>{result.note}</p>}
            {result.requestId && <p className="pushAudienceNote">Ref: {result.requestId}</p>}
          </div>
        )}
      </div>

      <div className="card adminSectionCard">
        <div className="adminSectionHead">
          <div><span>CİHAZLAR</span><h3>Kayıtlı bildirim cihazları</h3></div>
          <button type="button" className="ghost" onClick={resetDevices}>
            Tümünü sıfırla
          </button>
        </div>
        {devices.length ? devices.map((device) => (
          <div className="deviceRow" key={device.id || device.token}>
            <div>
              <b>{device.name || 'Üye'}</b>
              <p>
                {device.phone || '—'} · {formatDeviceLabel(device)}
                {device.active === false ? ' · pasif' : ''}
                {' · '}{device.lastSeenAt || device.updatedAt || device.createdAt || 'Tarih yok'}
              </p>
            </div>
            <button
              type="button"
              className="ghost deviceRemoveBtn"
              onClick={() => removeDevice(device.id, device.token)}
              aria-label="Kaldır"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )) : (
          <p className="emptySmall">
            Henüz bildirim izni veren cihaz yok. Üyeler uygulamada bildirimleri açmalı.
          </p>
        )}
      </div>

      {pushLog.length > 0 && (
        <div className="card adminSectionCard">
          <div className="adminSectionHead">
            <div><span>GEÇMİŞ</span><h3>Son gönderimler</h3></div>
          </div>
          {pushLog.slice(0, 8).map((row) => (
            <div className="historyMini" key={row.id}>
              <div>
                <b>{row.title || 'Bildirim'}</b>
                <p>
                  {row.createdAt} · {row.audienceLabel || 'Tüm kullanıcılar'} · {row.sent || 0}/{row.deviceCount || 0} cihaz
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>
              <strong>{row.sent || 0}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
