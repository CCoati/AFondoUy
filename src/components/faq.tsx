export const questions = [
  ["¿Cómo elijo mis números?", "Entrá a un sorteo de demostración y tocá los números disponibles. También podés buscar uno en particular o usar la selección al azar. Vas a ver tu selección y el total al instante."],
  ["¿Puedo comprar o reservar en esta versión?", "Las páginas identificadas como DEMO no crean reservas ni cobros. Los sorteos conectados pueden reservar números al iniciar checkout, si el entorno está habilitado. Elegir números por sí solo no los reserva. Los pagos reales permanecen deshabilitados."],
  ["¿Cómo funcionan las promociones?", "El servidor busca la combinación más conveniente entre packs e individuales. En la demo del BMW, 3 cuestan $2.700 y 5 cuestan $4.250; los packs pueden combinarse. El resumen muestra subtotal, descuento y total. Los sorteos conectados utilizan sus promociones vigentes."],
  ["¿Cuándo se realiza el sorteo?", "Cada sorteo real deberá publicar su fecha o condición de realización, sus bases y la mecánica de entrega. Los ejemplos de esta versión no tienen una fecha de sorteo real."],
  ["¿Necesito crear una cuenta?", "La experiencia prevista permite participar sin crear una cuenta. En esta demostración no te pedimos datos personales ni de pago."],
  ["¿Dónde se publicarán los ganadores?", "En la sección Resultados. Solo se mostrarán ganadores y actas cuando exista información verificada y autorización para publicarla. Hoy no hay ganadores reales publicados."],
];
export function Faq({ limit }: { limit?: number }) {
  return <div className="faq">{questions.slice(0, limit).map(([question, answer]) => <details key={question}><summary>{question}<span className="faq-plus" aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>;
}
