import { CloudOff, Loader2, RefreshCw } from 'lucide-react';

// Bulut senkron durumu — kayıt hatasında tekrar dene
export default function SyncStatusBanner({ syncState, onRetry }) {
  const { status, lastError } = syncState || {};

  if (status === 'idle' || status === 'synced') return null;

  if (status === 'saving') {
    return (
      <div className="syncStatusBanner syncStatusBanner--saving" role="status">
        <Loader2 size={16} className="spinIcon" aria-hidden="true" />
        <span>Sunucuya kaydediliyor…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="syncStatusBanner syncStatusBanner--error" role="alert">
        <CloudOff size={16} aria-hidden="true" />
        <span>{lastError || 'Senkronizasyon hatası'}</span>
        <button type="button" className="syncStatusRetry" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Tekrar dene
        </button>
      </div>
    );
  }

  return null;
}
