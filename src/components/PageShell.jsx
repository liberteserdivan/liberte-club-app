// Tüm sekme sayfaları için ortak kabuk — hero + gövde düzeni
export default function PageShell({
  variant = 'default',
  eyebrow,
  title,
  subtitle,
  heroSlot,
  header,
  stickySlot,
  children,
  className = '',
  bodyClassName = ''
}) {
  const hasHero = eyebrow || title || subtitle || heroSlot || header;

  return (
    <section className={`pagePro pagePro--${variant} ${className}`.trim()}>
      {hasHero && (
        <div className="pageProHero">
          {header}
          <div className="pageProHeroContent">
            {eyebrow && <span className="pageProEyebrow">{eyebrow}</span>}
            {title && <h1 className="pageProTitle">{title}</h1>}
            {subtitle && <p className="pageProSubtitle">{subtitle}</p>}
            {heroSlot}
          </div>
        </div>
      )}
      {stickySlot}
      <div className={`pageProBody ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
