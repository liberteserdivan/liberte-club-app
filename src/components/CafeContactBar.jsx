import { Instagram, MapPin, Phone } from 'lucide-react';
import { instagramUrl, mapsUrl, phoneUrl } from '../lib/constants.js';

// Konum, arama ve Instagram — App Store native hissi
export default function CafeContactBar({ compact = false }) {
  return (
    <div className={`cafeContactBar${compact ? ' cafeContactBar--compact' : ''}`}>
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="cafeContactBtn">
        <MapPin size={18} />
        <span>Konum</span>
      </a>
      <a href={phoneUrl} className="cafeContactBtn">
        <Phone size={18} />
        <span>Ara</span>
      </a>
      <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="cafeContactBtn">
        <Instagram size={18} />
        <span>Instagram</span>
      </a>
    </div>
  );
}
