import { DEFAULT_LOGO } from '../lib/constants.js';

// Liberte bardak logosu — ikram kartı ve selamlama
export default function LiberteMarkIcon({ size = 32, className = '' }) {
  return (
    <img
      className={`liberteMarkIcon ${className}`.trim()}
      src={DEFAULT_LOGO}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}
