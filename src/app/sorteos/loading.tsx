export default function LoadingRaffles() {
  return <div className="wrap page-body" aria-busy="true" aria-label="Cargando sorteos"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-copy" /><div className="skeleton-grid">{[0, 1, 2].map(item => <div className="skeleton skeleton-card" key={item} />)}</div><span className="sr-only">Cargando sorteos…</span></div>;
}
