import { useEffect } from 'react';
import { Bell, X } from 'lucide-react';

// Tarih metnini okunabilir göster
function formatMessageWhen(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(parsed));
  } catch {
    return raw;
  }
}

// Push tıklanınca açılan alt sheet — marka yeşili, okunaklı gövde
export default function PushMessageSheet({ message, onClose }) {
  const open = Boolean(message?.title || message?.body);
  const when = formatMessageWhen(message?.createdAt);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(event) {
      if (event.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pushSheetBackdrop" onClick={onClose} role="presentation">
      <div
        className="pushSheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="push-message-title"
        aria-modal="true"
      >
        <div className="pushSheetAccent" aria-hidden="true" />
        <div className="pushSheetHandle" aria-hidden="true" />
        <header className="pushSheetHead">
          <div className="pushSheetBadge" aria-hidden="true">
            <Bell size={20} strokeWidth={2.25} />
          </div>
          <div className="pushSheetHeadText">
            <span className="pushSheetEyebrow">Yeni bildirim</span>
            <h2 id="push-message-title">{message.title || 'Liberte Club'}</h2>
            {when ? <time className="pushSheetWhen" dateTime={message.createdAt}>{when}</time> : null}
          </div>
          <button type="button" className="pushSheetClose" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </header>

        {message.body ? (
          <div className="pushSheetBody">
            <p>{message.body}</p>
          </div>
        ) : (
          <div className="pushSheetBody pushSheetBodyMuted">
            <p>Bu bildirimin ayrıntısı yok; ana ekrandan devam edebilirsin.</p>
          </div>
        )}

        <footer className="pushSheetFoot">
          <button type="button" className="pushSheetCta" onClick={onClose}>
            Anladım
          </button>
        </footer>
      </div>
    </div>
  );
}
