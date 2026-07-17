import { useEffect, useState } from 'react';
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

// Push tıklanınca ortada açılan marka bildirimi
export default function PushMessageSheet({ message, onClose }) {
  const open = Boolean(message?.title || message?.body);
  const when = formatMessageWhen(message?.createdAt);
  const bodyText = message?.body
    || 'Bu bildirimin ayrıntısı yok; ana ekrandan devam edebilirsin.';
  const imageUrl = String(message?.imageUrl || '').trim();
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

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
    <div className="pushBannerBackdrop" onClick={onClose} role="presentation">
      <div
        className={`pushBanner${showImage ? ' pushBannerHasMedia' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="push-message-title"
        aria-modal="true"
      >
        <div className="pushBannerGlow" aria-hidden="true" />
        <button type="button" className="pushBannerClose" onClick={onClose} aria-label="Kapat">
          <X size={18} />
        </button>

        {showImage ? (
          <div className="pushBannerMedia">
            <img
              src={imageUrl}
              alt=""
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : (
          <div className="pushBannerHero">
            <div className="pushBannerRing" aria-hidden="true">
              <div className="pushBannerBadge">
                <Bell size={26} strokeWidth={2.1} />
              </div>
            </div>
            <p className="pushBannerBrand">Liberte Club</p>
            <span className="pushBannerLabel">Yeni bildirim</span>
          </div>
        )}

        <div className="pushBannerContent">
          {showImage ? (
            <span className="pushBannerLabel">Yeni bildirim</span>
          ) : null}
          <h2 id="push-message-title">{message.title || 'Liberte Club'}</h2>
          {when ? (
            <time className="pushBannerWhen" dateTime={message.createdAt}>{when}</time>
          ) : null}
          <p className="pushBannerBody">{bodyText}</p>
          <button type="button" className="pushBannerCta" onClick={onClose}>
            Anladım
          </button>
        </div>
      </div>
    </div>
  );
}
