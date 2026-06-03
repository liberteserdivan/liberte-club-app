// Kafe marka logosu veya varsayılan L işareti
export default function Brand({ db, small = false, admin = false }) {
  const cls = [
    admin ? 'brandLogo admin' : small ? 'brandLogo small' : 'brandLogo',
    !db.settings.logo && (admin ? 'brandFallback admin' : small ? 'logo small' : 'logo')
  ].filter(Boolean).join(' ');

  return db.settings.logo
    ? <img className={cls} src={db.settings.logo} alt={db.settings.cafe_name || 'Liberte'} />
    : <div className={admin ? 'brandFallback admin' : small ? 'logo small' : 'logo'}><b>L</b><span>Liberte</span></div>;
}
