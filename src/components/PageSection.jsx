// Sayfa içi bölüm başlığı ve içerik düzeni
export default function PageSection({
  label,
  title,
  count,
  action,
  children,
  className = '',
  tight = false
}) {
  const hasHead = label || title || count != null || action;

  return (
    <section className={`pageSection${tight ? ' pageSection--tight' : ''} ${className}`.trim()}>
      {hasHead && (
        <div className="pageSectionHead">
          <div className="pageSectionHeadText">
            {label && <p className="pageSectionLabel">{label}</p>}
            {title != null && title !== '' && <h3 className="pageSectionTitle">{title}</h3>}
          </div>
          {count != null && <em className="pageSectionCount">{count}</em>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
