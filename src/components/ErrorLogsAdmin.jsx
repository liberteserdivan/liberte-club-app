import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { clearErrorLogs, fetchErrorLogs } from '../lib/errorLogClient.js';
import { captureException, reportError } from '../lib/errorHub.js';

// Durum mesajı tonu
function logStatusClass(message = '') {
  const text = String(message || '').toLowerCase();
  if (/başarısız|alınamadı|silinemedi|yapılamadı/.test(text)) return ' isError';
  return ' isSuccess';
}

// Yönetici — sistem hata logları (son 7 gün)
export default function ErrorLogsAdmin() {
  const [logs, setLogs] = useState([]);
  const [retentionDays, setRetentionDays] = useState(7);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');

  const loadLogs = useCallback(async () => {
    setBusy('load');
    setStatus('');
    try {
      const data = await fetchErrorLogs(200);
      setLogs(data.logs);
      setRetentionDays(data.retentionDays);
    } catch (error) {
      captureException(error, 'admin.errorLogs', 'Log listesi yüklenemedi.');
      setStatus(error.message || 'Log listesi alınamadı.');
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function handleClear() {
    if (!window.confirm('Tüm hata logları silinsin mi? Bu işlem geri alınamaz.')) return;
    setBusy('clear');
    setStatus('');
    try {
      const removed = await clearErrorLogs();
      setLogs([]);
      setStatus(`${removed} kayıt silindi.`);
      reportError({
        source: 'admin.errorLogs',
        message: `Admin cleared ${removed} error logs`,
        userMessage: 'Loglar temizlendi.',
        level: 'info',
        showToast: true,
        persist: true
      });
    } catch (error) {
      captureException(error, 'admin.errorLogs', 'Loglar silinemedi.');
      setStatus(error.message || 'Silme başarısız.');
    } finally {
      setBusy('');
    }
  }

  function levelLabel(level) {
    if (level === 'warn') return 'Uyarı';
    if (level === 'info') return 'Bilgi';
    return 'Hata';
  }

  return (
    <div className="card adminSectionCard">
      <div className="adminSectionHead">
        <div>
          <span>SİSTEM</span>
          <h3>Hata logları</h3>
        </div>
        <AlertTriangle size={18} aria-hidden="true" />
      </div>

      <p className="adminHint">
        Son {retentionDays} günlük uygulama ve senkron hataları. Eski kayıtlar otomatik silinir.
      </p>

      <div className="adminBackupActions">
        <button
          type="button"
          className="ghost"
          disabled={busy === 'load'}
          onClick={loadLogs}
        >
          <RefreshCw size={16} /> {busy === 'load' ? 'Yükleniyor…' : 'Yenile'}
        </button>
        <button
          type="button"
          className="ghost dangerGhost"
          disabled={busy === 'clear' || !logs.length}
          onClick={handleClear}
        >
          <Trash2 size={16} /> {busy === 'clear' ? 'Siliniyor…' : 'Tümünü sil'}
        </button>
      </div>

      {status && <p className={`adminBackupStatus${logStatusClass(status)}`}>{status}</p>}

      {logs.length ? (
        <div className="errorLogList">
          {logs.map((row) => (
            <div className="errorLogRow" key={row.id}>
              <div className="errorLogRowHead">
                <span className={`errorLogBadge errorLogBadge--${row.level}`}>
                  {levelLabel(row.level)}
                </span>
                <time>{new Date(row.createdAt).toLocaleString('tr-TR')}</time>
              </div>
              <strong>{row.source}</strong>
              <p>{row.message}</p>
              <small>
                {row.platform || '—'}
                {row.customerId ? ` · Üye #${row.customerId}` : ''}
                {row.code ? ` · ${row.code}` : ''}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="emptySmall">Henüz kayıtlı hata yok.</p>
      )}
    </div>
  );
}
