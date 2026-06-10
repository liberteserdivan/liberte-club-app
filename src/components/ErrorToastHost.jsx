import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { dismissErrorToast, subscribeErrorHub } from '../lib/errorHub.js';

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
            <strong>{item.source}</strong>
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
