// Alt menü QR ikonu — Liberté marka renkleriyle renkli mini QR
const RENK = {
  orman: '#0B2F26',
  ormanAcik: '#1F5D4F',
  altin: '#D8C29D',
  altinKoyu: '#B9945E',
  nane: '#6EC9A8',
  krem: '#F7EFE2'
};

export default function NavQrIcon({ className = '', ...props }) {
  return (
    <svg
      className={`navQrIcon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5" fill={RENK.krem} />
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5"
        stroke={RENK.altinKoyu}
        strokeWidth="1.5"
      />

      <rect
        x="5.25"
        y="5.25"
        width="5"
        height="5"
        rx="1.4"
        fill={RENK.ormanAcik}
        fillOpacity="0.18"
        stroke={RENK.orman}
        strokeWidth="1.35"
      />
      <rect x="6.75" y="6.75" width="2" height="2" rx="0.55" fill={RENK.orman} />

      <rect
        x="13.75"
        y="5.25"
        width="5"
        height="5"
        rx="1.4"
        fill={RENK.altin}
        fillOpacity="0.35"
        stroke={RENK.altinKoyu}
        strokeWidth="1.35"
      />
      <rect x="15.25" y="6.75" width="2" height="2" rx="0.55" fill={RENK.altinKoyu} />

      <rect
        x="5.25"
        y="13.75"
        width="5"
        height="5"
        rx="1.4"
        fill={RENK.nane}
        fillOpacity="0.28"
        stroke={RENK.ormanAcik}
        strokeWidth="1.35"
      />
      <rect x="6.75" y="15.25" width="2" height="2" rx="0.55" fill={RENK.nane} />

      <rect x="12.5" y="12.5" width="2.1" height="2.1" rx="0.45" fill={RENK.altinKoyu} />
      <rect x="15.65" y="12.5" width="2.1" height="2.1" rx="0.45" fill={RENK.orman} />
      <rect x="12.5" y="15.65" width="2.1" height="2.1" rx="0.45" fill={RENK.nane} />
      <rect x="15.65" y="15.65" width="2.1" height="2.1" rx="0.45" fill={RENK.altin} />
      <rect x="12.5" y="18.35" width="5.25" height="1.35" rx="0.45" fill={RENK.ormanAcik} />
    </svg>
  );
}
