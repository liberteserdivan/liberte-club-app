import React, { useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck,
  Copy, Bell, Database, Server, LogIn, QrCode, Gift, Radio, Loader2
} from 'lucide-react';
import useGuardianHealth from '../hooks/useGuardianHealth.js';
import {
  enableSafeMode, disableSafeMode, generateReport, sendTestAlert, resolveIncident
} from '../lib/guardianClient.js';
import { getRecentRequests, getTelemetrySummary } from '../lib/guardianTelemetry.js';

// Liberte Guardian — admin "Sistem Sağlığı" paneli
// Tek sorumluluk: sağlık/incident/safe-mode verisini göstermek ve güvenli
// yönetim aksiyonlarını (health check, safe mode, rapor, test alert) sunmak.

// Durum → renk/etiket eşlemesi
const STATUS_META = {
  healthy: { label: 'Sağlıklı', color: '#16a34a', Icon: CheckCircle2 },
  degraded: { label: 'Yavaş', color: '#d97706', Icon: Activity },
  incident: { label: 'Sorun', color: '#ea580c', Icon: AlertTriangle },
  critical: { label: 'Kritik', color: '#dc2626', Icon: ShieldAlert }
};

const SERVICE_META = {
  db: { label: 'Veritabanı', Icon: Database },
  login: { label: 'Giriş', Icon: LogIn },
  auth: { label: 'Oturum', Icon: LogIn },
  qr: { label: 'QR', Icon: QrCode },
  loyalty: { label: 'LP / Sadakat', Icon: Gift },
  realtime: { label: 'Realtime', Icon: Radio },
  config: { label: 'Yapılandırma', Icon: Server },
  api: { label: 'API', Icon: Server }
};

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.healthy;
}

// Tek servis kartı
function ServiceCard({ serviceKey, report }) {
  const meta = SERVICE_META[serviceKey] || { label: serviceKey, Icon: Server };
  const sMeta = statusMeta(report?.status);
  const ServiceIcon = meta.Icon;
  const StatusIcon = sMeta.Icon;
  return (
    <div className="guardianCard" style={{ borderColor: sMeta.color }}>
      <div className="guardianCardHead">
        <ServiceIcon size={16} />
        <span>{meta.label}</span>
        <span className="guardianBadge" style={{ background: sMeta.color }}>
          <StatusIcon size={12} /> {sMeta.label}
        </span>
      </div>
      <div className="guardianCardMeta">
        {report?.durationMs != null && <span>Süre: {report.durationMs}ms</span>}
        {report?.details?.p95Ms != null && <span>p95: {report.details.p95Ms}ms</span>}
        {report?.details?.errorRate != null && <span>Hata: %{Math.round((report.details.errorRate || 0) * 100)}</span>}
        {report?.details?.lastRequestId && <span>Ref: {report.details.lastRequestId}</span>}
      </div>
    </div>
  );
}

export default function SystemHealthPanel() {
  const { health, status, error, refresh } = useGuardianHealth({ enabled: true });
  const [busy, setBusy] = useState('');
  const [reportText, setReportText] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const overall = health?.status || 'healthy';
  const overallMeta = statusMeta(overall);
  const services = health?.services || {};
  const incidents = health?.incidents || [];
  const alerts = health?.alerts || [];
  const safeMode = health?.safeMode || { enabled: false };
  const telemetry = getTelemetrySummary();
  const recent = getRecentRequests(20);

  // Güvenli aksiyonu sarmala — çift tık/yarış engeli + mesaj
  async function runAction(key, fn, okMsg) {
    if (busy) return;
    setBusy(key);
    setActionMsg('');
    try {
      await fn();
      setActionMsg(okMsg);
      await refresh();
    } catch (err) {
      setActionMsg(err?.message || 'İşlem başarısız.');
    } finally {
      setBusy('');
    }
  }

  // Rapor üret ve kopyalanabilir metni göster
  async function handleGenerateReport() {
    if (busy) return;
    setBusy('report');
    setActionMsg('');
    try {
      const data = await generateReport();
      if (data?.ok && data.incidentReportMd) {
        setReportText(`${data.incidentReportMd}\n\n----- CURSOR_FIX_PROMPT.md -----\n${data.cursorFixPromptMd || ''}`);
        setActionMsg('Rapor üretildi. Aşağıdan kopyalayabilirsiniz.');
      } else {
        setReportText('');
        setActionMsg(data?.message || 'Açık incident yok — rapor üretilmedi.');
      }
    } catch (err) {
      setActionMsg(err?.message || 'Rapor üretilemedi.');
    } finally {
      setBusy('');
    }
  }

  // Rapor metnini panoya kopyala
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      setActionMsg('Rapor panoya kopyalandı.');
    } catch {
      setActionMsg('Kopyalama başarısız — metni elle seçin.');
    }
  }

  return (
    <div className="adminStack guardianPanel">
      <div className="guardianHero" style={{ borderColor: overallMeta.color }}>
        <div className="guardianHeroMain">
          <ShieldCheck size={22} style={{ color: overallMeta.color }} />
          <div>
            <h3>Sistem Sağlığı</h3>
            <p>
              Genel durum: <strong style={{ color: overallMeta.color }}>{overallMeta.label}</strong>
              {safeMode.enabled && <span className="guardianSafePill"> · Safe Mode açık ({safeMode.level})</span>}
            </p>
          </div>
        </div>
        <button type="button" className="guardianBtn" onClick={refresh} disabled={status === 'loading'}>
          {status === 'loading' ? <Loader2 size={15} className="guardianSpin" /> : <RefreshCw size={15} />} Health check
        </button>
      </div>

      {/* Guardian v1 bellek tabanlı çalışır — kalıcılık sınırı admin'e açıkça bildirilir */}
      <div className="guardianMemoryNote">
        <AlertTriangle size={14} />
        <span>
          Guardian v1 memory mode&apos;da çalışıyor. Cold start veya çoklu instance durumunda
          geçmiş metrikler ve Safe Mode durumu kalıcı olmayabilir.
        </span>
      </div>

      {error && <div className="guardianError">{error}</div>}
      {actionMsg && <div className="guardianNotice">{actionMsg}</div>}

      <div className="guardianGrid">
        {['db', 'login', 'qr', 'loyalty', 'realtime', 'config'].map((key) => (
          <ServiceCard key={key} serviceKey={key} report={services[key]} />
        ))}
      </div>

      <div className="guardianActions">
        <button type="button" className="guardianBtn" disabled={Boolean(busy)}
          onClick={() => runAction('safeOn', () => enableSafeMode({ reason: 'admin_manual' }), 'Safe Mode açıldı.')}>
          <ShieldAlert size={15} /> Safe Mode aç
        </button>
        <button type="button" className="guardianBtn" disabled={Boolean(busy)}
          onClick={() => runAction('safeOff', () => disableSafeMode(), 'Safe Mode kapatıldı.')}>
          <ShieldCheck size={15} /> Safe Mode kapat
        </button>
        <button type="button" className="guardianBtn" disabled={Boolean(busy)} onClick={handleGenerateReport}>
          <Server size={15} /> Incident raporu oluştur
        </button>
        <button type="button" className="guardianBtn" disabled={Boolean(busy)}
          onClick={() => runAction('testAlert', () => sendTestAlert(), 'Test bildirimi gönderildi.')}>
          <Bell size={15} /> Test alert gönder
        </button>
      </div>

      <div className="guardianSection">
        <h4>Son Incident'lar</h4>
        {incidents.length === 0 && <p className="guardianMuted">Açık incident yok.</p>}
        {incidents.map((inc) => (
          <div key={inc.id} className="guardianIncident" style={{ borderColor: statusMeta(inc.level).color }}>
            <div className="guardianIncidentHead">
              <span className="guardianBadge" style={{ background: statusMeta(inc.level).color }}>{inc.level}</span>
              <strong>{inc.title}</strong>
              {inc.requiresHuman && <span className="guardianHuman">İnsan müdahalesi gerekiyor</span>}
            </div>
            <div className="guardianCardMeta">
              <span>Alan: {inc.affectedArea}</span>
              <span>Başlangıç: {new Date(inc.startedAt).toLocaleString('tr-TR')}</span>
              <span>Tekrar: {inc.occurrences || 1}</span>
            </div>
            {Array.isArray(inc.safeActionsTaken) && inc.safeActionsTaken.length > 0 && (
              <div className="guardianCardMeta">Bot aksiyonu: {inc.safeActionsTaken.join(', ')}</div>
            )}
            <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
              onClick={() => runAction(`resolve-${inc.id}`, () => resolveIncident(inc.id), 'Incident çözüldü olarak işaretlendi.')}>
              Çözüldü işaretle
            </button>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="guardianSection">
          <h4>Son Uyarılar</h4>
          {alerts.map((a) => (
            <div key={a.id} className="guardianCardMeta">
              <span>{new Date(a.createdAt).toLocaleString('tr-TR')}</span>
              <span>{a.title}</span>
              <span>e-posta: {a.channels?.email ? 'gönderildi' : 'gönderilmedi'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="guardianSection">
        <h4>Son İstekler (istemci)</h4>
        <div className="guardianCardMeta">
          Toplam: {telemetry.total} · Hata: {telemetry.error} · Timeout: {telemetry.timeout} · Network: {telemetry.networkError}
        </div>
        <div className="guardianTelemetry">
          {recent.map((r, idx) => (
            <div key={idx} className={r.ok ? 'guardianReqOk' : 'guardianReqErr'}>
              {r.method} {r.endpoint} · {r.status || 'ERR'} · {r.durationMs != null ? `${r.durationMs}ms` : '—'}
              {r.requestId ? ` · ${r.requestId}` : ''}
            </div>
          ))}
          {recent.length === 0 && <p className="guardianMuted">Henüz istek kaydı yok.</p>}
        </div>
      </div>

      {reportText && (
        <div className="guardianSection">
          <h4>Rapor (kopyalanabilir)</h4>
          <button type="button" className="guardianBtnSmall" onClick={copyReport}><Copy size={13} /> Kopyala</button>
          <textarea className="guardianReport" readOnly value={reportText} rows={16} />
        </div>
      )}
    </div>
  );
}
