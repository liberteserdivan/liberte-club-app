import { X } from 'lucide-react';
import { LEGAL_UPDATED, privacyPolicySections, termsOfUseSections } from '../lib/legalContent.js';

// Yasal metin tam ekran paneli
export default function LegalSheet({ type, onClose }) {
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Gizlilik Politikası' : 'Kullanım Şartları';
  const sections = isPrivacy ? privacyPolicySections : termsOfUseSections;

  return (
    <div className="legalSheetBackdrop" onClick={onClose}>
      <div className="legalSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="legalSheetHead">
          <div>
            <span>YASAL</span>
            <h2>{title}</h2>
            <p>Güncelleme: {LEGAL_UPDATED}</p>
          </div>
          <button type="button" className="legalSheetClose" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        <div className="legalSheetBody">
          {sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
