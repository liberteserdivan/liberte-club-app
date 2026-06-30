import React, { useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck,
  Copy, Bell, Database, Server, LogIn, QrCode, Gift, Radio, Loader2, Sparkles
} from 'lucide-react';
import useGuardianHealth from '../hooks/useGuardianHealth.js';
import {
  enableSafeMode, disableSafeMode, generateReport, sendTestAlert, resolveIncident,
  approveAction, rejectAction, rollbackAction
} from '../lib/guardianClient.js';
import { getRecentRequests, getTelemetrySummary } from '../lib/guardianTelemetry.js';
import { deriveClientHealth, clientStatusForService } from '../lib/clientHealthSeverity.js';

// İki sağlık seviyesinden kötü olanı seç (server overall + client severity birleşimi)
const SEVERITY_RANK = { healthy: 0, degraded: 1, incident: 2, critical: 3 };
function worstSeverity(a, b) {
  return (SEVERITY_RANK[b] ?? 0) > (SEVERITY_RANK[a] ?? 0) ? b : a;
}

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

// Risk seviyesi → renk/etiket (bölüm 8)
const RISK_META = {
  0: { color: '#64748b', label: 'Level 0 · Otomatik' },
  1: { color: '#0284c7', label: 'Level 1 · Güvenli geçici' },
  2: { color: '#ea580c', label: 'Level 2 · Onay gerekli' },
  3: { color: '#dc2626', label: 'Level 3 · Otomatik uygulanamaz' }
};

function riskMeta(level) {
  return RISK_META[level] ?? RISK_META[3];
}

// Tek servis kartı — client telemetry severity'si server raporundan kötüyse o gösterilir
function ServiceCard({ serviceKey, report, clientStatus }) {
  const meta = SERVICE_META[serviceKey] || { label: serviceKey, Icon: Server };
  const effectiveStatus = clientStatus
    ? worstSeverity(report?.status || 'healthy', clientStatus)
    : report?.status;
  const sMeta = statusMeta(effectiveStatus);
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

  const telemetry = getTelemetrySummary();
  const recent = getRecentRequests(20);

  // Client telemetry'den gerçeğe uygun severity türet — server "healthy" dese bile
  // cihazda hata/timeout varsa panel yeşil kalmaz.
  const clientHealth = deriveClientHealth(recent);

  const serverOverall = health?.status || 'healthy';
  // Genel durum = server overall ile client severity'nin kötüsü
  const overall = worstSeverity(serverOverall, clientHealth.severity);
  const overallMeta = statusMeta(overall);
  const services = health?.services || {};
  // Server incident'ları + client kaynaklı incident'lar birleştirilir
  const serverIncidents = health?.incidents || [];
  const clientIncidents = clientHealth.incidents.map((inc, idx) => ({
    id: `client-${idx}`,
    level: inc.level,
    title: inc.title,
    affectedArea: inc.affectedArea,
    startedAt: Date.now(),
    occurrences: 1,
    clientOnly: true
  }));
  const incidents = [...serverIncidents, ...clientIncidents];
  const alerts = health?.alerts || [];
  const safeMode = health?.safeMode || { enabled: false };

  // Approval Autopilot — onay merkezi grupları
  const actions = health?.actions || {};
  const pendingProposals = actions.pending || [];
  const aiFixWaiting = actions.aiFixWaiting || [];
  const humanRequired = actions.humanRequired || [];
  const appliedActions = actions.executed || [];

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

  // Action API çağrısını sarmala: ok:false dönerse hata fırlat (runAction mesajı gösterir)
  function callAction(fn) {
    return async () => {
      const data = await fn();
      if (data && data.ok === false) {
        throw new Error(data.message || data.error || 'İşlem uygulanamadı.');
      }
    };
  }

  // Belirli bir incident için Cursor fix prompt üret ve panoya kopyala
  async function copyCursorPrompt(incidentId) {
    if (busy) return;
    setBusy(`cursor-${incidentId || 'latest'}`);
    setActionMsg('');
    try {
      const data = await generateReport(incidentId || null);
      const text = data?.cursorFixPromptMd || '';
      if (!text) {
        setActionMsg('Cursor prompt üretilemedi (açık incident yok).');
        return;
      }
      await navigator.clipboard.writeText(text);
      setActionMsg('Cursor fix prompt panoya kopyalandı.');
    } catch (err) {
      setActionMsg(err?.message || 'Cursor prompt kopyalanamadı.');
    } finally {
      setBusy('');
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
          <ServiceCard
            key={key}
            serviceKey={key}
            report={services[key]}
            clientStatus={clientStatusForService(key, clientHealth)}
          />
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
        <h4>Guardian Onay Merkezi</h4>
        <p className="guardianMuted">
          Bot sorunları algılar ve güvenli öneriler üretir. Etkili (Level 2) aksiyonlar yalnızca
          siz onayladıktan sonra uygulanır. Riskli (Level 3) işlemler asla otomatik çalışmaz.
        </p>

        {pendingProposals.length === 0 && aiFixWaiting.length === 0 && humanRequired.length === 0 && appliedActions.length === 0 && (
          <p className="guardianMuted">Şu an bekleyen öneri yok.</p>
        )}

        {/* Faz 3 — AI fix bekliyor kartları (Level 3, otomatik uygulanmaz) */}
        {aiFixWaiting.length > 0 && (
          <div className="guardianAiFixSection">
            <div className="guardianAiFixHead">
              <Sparkles size={16} />
              <strong>AI Fix Bekliyor</strong>
              <span className="guardianBadge" style={{ background: '#7c3aed' }}>{aiFixWaiting.length}</span>
            </div>
            <p className="guardianMuted">
              Bot incident raporu ve Cursor promptunu hazırladı. Düzeltme otomatik uygulanmaz —
              promptu kopyalayıp Cursor&apos;da manuel düzeltme yapın.
            </p>
          </div>
        )}
        {aiFixWaiting.map((p) => (
          <div key={p.id} className="guardianProposal guardianAiFixCard">
            <div className="guardianProposalHead">
              <span className="guardianBadge guardianAiFixBadge"><Sparkles size={12} /> AI fix bekliyor</span>
              <strong>{p.title}</strong>
            </div>
            <p className="guardianProposalDesc">{p.description}</p>
            <div className="guardianCardMeta">
              <span>Etkilenen alan: {p.affectedArea}</span>
              {p.incidentId && <span>Incident: {p.incidentId}</span>}
              {p.parameters?.reportGeneratedAt && (
                <span>Rapor: {new Date(p.parameters.reportGeneratedAt).toLocaleString('tr-TR')}</span>
              )}
            </div>
            {p.parameters?.promptPreview && (
              <textarea
                className="guardianAiFixPreview"
                readOnly
                rows={4}
                value={p.parameters.promptPreview}
              />
            )}
            <div className="guardianActions">
              <button type="button" className="guardianBtnSmall guardianAiFixPrimary" disabled={Boolean(busy)}
                onClick={() => copyCursorPrompt(p.incidentId)}>
                <Copy size={13} /> Cursor prompt&apos;u kopyala
              </button>
              <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                onClick={() => runAction(`report-${p.incidentId}`, async () => {
                  const data = await generateReport(p.incidentId || null);
                  if (data?.ok && data.incidentReportMd) {
                    setReportText(`${data.incidentReportMd}\n\n----- CURSOR_FIX_PROMPT.md -----\n${data.cursorFixPromptMd || ''}`);
                    setActionMsg('Tam rapor hazır — aşağıdan kopyalayabilirsiniz.');
                  }
                }, 'Tam rapor yüklendi.')}>
                <Server size={13} /> Tam raporu göster
              </button>
              <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                onClick={() => runAction(`reject-${p.id}`, callAction(() => rejectAction(p.id, 'ai_fix_dismissed')), 'AI fix kartı kapatıldı.')}>
                Kapat
              </button>
            </div>
          </div>
        ))}

        {/* Bekleyen öneriler — onay/ret */}
        {pendingProposals.map((p) => {
          const rm = riskMeta(p.riskLevel);
          return (
            <div key={p.id} className="guardianProposal" style={{ borderColor: rm.color }}>
              <div className="guardianProposalHead">
                <span className="guardianBadge" style={{ background: rm.color }}>{rm.label}</span>
                <strong>{p.title}</strong>
              </div>
              <p className="guardianProposalDesc">{p.description}</p>
              <div className="guardianCardMeta">
                <span>Etkilenen alan: {p.affectedArea}</span>
                <span>Aksiyon: {p.proposedAction}</span>
                {p.parameters?.ttlMinutes != null && <span>TTL: {p.parameters.ttlMinutes} dk</span>}
                {p.incidentId && <span>Incident: {p.incidentId}</span>}
              </div>
              {Array.isArray(p.expectedEffect) && p.expectedEffect.length > 0 && (
                <div className="guardianProposalList">
                  <span>Beklenen fayda:</span>
                  <ul>{p.expectedEffect.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              {Array.isArray(p.risks) && p.risks.length > 0 && (
                <div className="guardianProposalList">
                  <span>Riskler:</span>
                  <ul>{p.risks.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              {p.rollback?.description && (
                <div className="guardianCardMeta"><span>Geri alma: {p.rollback.description}</span></div>
              )}
              <div className="guardianActions">
                <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                  onClick={() => runAction(`approve-${p.id}`, callAction(() => approveAction(p.id)), 'Aksiyon onaylandı ve uygulandı.')}>
                  <CheckCircle2 size={13} /> Onayla ve uygula
                </button>
                <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                  onClick={() => runAction(`reject-${p.id}`, callAction(() => rejectAction(p.id, 'admin_reject')), 'Öneri reddedildi.')}>
                  Reddet
                </button>
                {p.incidentId && (
                  <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                    onClick={() => copyCursorPrompt(p.incidentId)}>
                    <Copy size={13} /> Cursor prompt&apos;u kopyala
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* İnsan müdahalesi gerekenler (Level 3) — asla otomatik uygulanmaz */}
        {humanRequired.map((p) => (
          <div key={p.id} className="guardianProposal guardianHumanCard" style={{ borderColor: '#dc2626' }}>
            <div className="guardianProposalHead">
              <span className="guardianBadge" style={{ background: '#dc2626' }}>İnsan müdahalesi gerekiyor</span>
              <strong>{p.title}</strong>
            </div>
            <p className="guardianProposalDesc">{p.description}</p>
            <p className="guardianMuted">
              Bu işlem otomatik uygulanamaz. İnsan müdahalesi gerekiyor. Cursor düzeltme prompt&apos;u hazırlandı.
            </p>
            <div className="guardianActions">
              <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                onClick={() => copyCursorPrompt(p.incidentId)}>
                <Copy size={13} /> Cursor prompt&apos;u kopyala
              </button>
              <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                onClick={() => runAction(`reject-${p.id}`, callAction(() => rejectAction(p.id, 'human_required_dismiss')), 'Reddedildi olarak işaretlendi.')}>
                Reddedildi işaretle
              </button>
            </div>
          </div>
        ))}

        {/* Uygulanmış aksiyonlar — geri alınabilir */}
        {appliedActions.map((p) => {
          const rm = riskMeta(p.riskLevel);
          return (
            <div key={p.id} className="guardianProposal" style={{ borderColor: '#16a34a' }}>
              <div className="guardianProposalHead">
                <span className="guardianBadge" style={{ background: '#16a34a' }}>Uygulandı</span>
                <strong>{p.title}</strong>
                <span className="guardianBadge" style={{ background: rm.color }}>{rm.label}</span>
              </div>
              <div className="guardianCardMeta">
                <span>Aksiyon: {p.proposedAction}</span>
                {p.executedAt && <span>Uygulandı: {new Date(p.executedAt).toLocaleString('tr-TR')}</span>}
                {p.approvedBy && <span>Onaylayan: {p.approvedBy}</span>}
              </div>
              <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                onClick={() => runAction(`rollback-${p.id}`, callAction(() => rollbackAction(p.id)), 'Aksiyon geri alındı.')}>
                Geri al
              </button>
            </div>
          );
        })}
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
            {inc.clientOnly ? (
              <div className="guardianCardMeta"><span>Kaynak: cihaz telemetrisi (son 20 istek)</span></div>
            ) : (
              <button type="button" className="guardianBtnSmall" disabled={Boolean(busy)}
                onClick={() => runAction(`resolve-${inc.id}`, () => resolveIncident(inc.id), 'Incident çözüldü olarak işaretlendi.')}>
                Çözüldü işaretle
              </button>
            )}
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
