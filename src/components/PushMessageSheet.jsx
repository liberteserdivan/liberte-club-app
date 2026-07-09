import React from 'react';
import { Bell, X } from 'lucide-react';

export default function PushMessageSheet({ message, onClose }) {
  if (!message?.title && !message?.body) return null;

  return (
    <div className="noticeBackdrop pushMessageBackdrop" onClick={onClose}>
      <div
        className="noticeModal info pushMessageModal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="push-message-title"
        aria-modal="true"
      >
        <button type="button" className="pushMessageClose" onClick={onClose} aria-label="Kapat">
          <X size={20} />
        </button>
        <div className="noticeIcon pushMessageIcon"><Bell aria-hidden="true" /></div>
        <h3 id="push-message-title">{message.title || 'Liberte Club'}</h3>
        {message.body ? <p className="pushMessageBody">{message.body}</p> : null}
        {message.createdAt ? <small className="pushMessageMeta">{message.createdAt}</small> : null}
        <button type="button" onClick={onClose}>Tamam</button>
      </div>
    </div>
  );
}