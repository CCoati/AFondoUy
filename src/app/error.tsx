"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="wrap page-body py-20"><h1 className="text-3xl font-bold">No pudimos cargar esta página.</h1><p className="muted my-6">Probá nuevamente dentro de unos instantes.</p><button className="button" onClick={reset}>Volver a intentar</button></div>;
}
