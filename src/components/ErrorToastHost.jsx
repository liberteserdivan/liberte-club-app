import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { dismissErrorToast, subscribeErrorHub } from '../lib/errorHub.js';

// Kullanıcıya gösterilecek toast başlığı
function toastTitle(item) {
  if (item.source === 'realtime.in_app') return 'Bildirim';
  if (item.level === 'warn') return 'Uyarı';
  return 'Bir sorun oluştu';
}

// Merkezi hata toast bildirimleri
export default function ErrorToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeErrorHub(setItems), []);

  if (!items.length) return null;

  return (
    <div className="errorToastHost" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`errorToast errorToast--${item.level}`}
          role="alert"
        >
          <AlertTriangle size={18} aria-hidden="true" />
          <div className="errorToastBody">
            <strong>{toastTitle(item)}</strong>
            <p>{item.userMessage}</p>
          </div>
          <button
            type="button"
            className="errorToastClose"
            aria-label="Kapat"
            onClick={() => dismissErrorToast(item.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
