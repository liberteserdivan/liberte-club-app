import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Açılır/kapanır premium bölüm
export default function PremiumSection({ title, subtitle, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`premiumSection${open ? ' isOpen' : ''}`}>
      <button type="button" className="premiumSectionHead" onClick={() => setOpen(!open)}>
        <div className="premiumSectionTitle">
          {Icon && <span className="premiumSectionIcon"><Icon size={18} /></span>}
          <div>
            <b>{title}</b>
            {subtitle && <small>{subtitle}</small>}
          </div>
        </div>
        <ChevronDown size={18} className="premiumSectionChevron" />
      </button>
      {open && <div className="premiumSectionBody">{children}</div>}
    </div>
  );
}
