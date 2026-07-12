export default function PageHero({ title, subtitle, children }) {
  return (
    <header className="pageHero">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </header>
  );
}
