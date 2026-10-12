export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children && <div className="muted leading-relaxed mt-5 max-w-2xl">{children}</div>}</div>;
}
