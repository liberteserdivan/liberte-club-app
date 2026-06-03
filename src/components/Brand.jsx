// Kafe marka logosu veya varsayılan L işareti
export default function Brand({ db, small = false }) {
  return db.settings.logo
    ? <img className={small ? 'brandLogo small' : 'brandLogo'} src={db.settings.logo} alt="" />
    : <div className={small ? 'logo small' : 'logo'}><b>L</b><span>Liberte</span></div>;
}
