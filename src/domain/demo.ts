import { MAX_SELECTION } from "./raffle";

export type NumberState = "available" | "reserved" | "sold" | "blocked";
export type PrizeImage = { src: string; alt: string; label: string; position?: string; zoom?: number };
export type DemoRaffle = {
  id: string; title: string; edition: string; category: "Motor";
  description: string; priceMinor: number; numberCount: number;
  images: PrizeImage[]; numbers: { number: number; state: NumberState }[];
  features: { label: string; value: string }[];
  promotion: { quantity: number; totalMinor: number };
};

function inventory(sold: number, reserved: number) {
  const order = Array.from({ length: 200 }, (_, i) => (i * 73) % 200 + 1);
  const soldSet = new Set(order.slice(0, sold));
  const reservedSet = new Set(order.slice(sold, sold + reserved));
  const blockedSet = new Set(order.slice(sold + reserved, sold + reserved + 2));
  return Array.from({ length: 200 }, (_, i) => ({ number: i + 1, state: soldSet.has(i + 1) ? "sold" as const : reservedSet.has(i + 1) ? "reserved" as const : blockedSet.has(i+1) ? "blocked" as const : "available" as const }));
}

// Desarrollo visual: los contadores siguen identificados como demo y no se publican como ventas reales.
export const demoRaffles: DemoRaffle[] = [{
  id: "coupe-gt", title: "BMW de competición", edition: "Preparación Racing", category: "Motor",
  description: "Un BMW clásico con espíritu de pista. Las fotos muestran su motor preparado, el puesto de conducción y el interior con equipamiento de competición. La presentación visual se mejoró con IA a partir de las fotos compartidas; consultá el estado y equipamiento reales antes de participar.",
  priceMinor: 100_000, numberCount: 200, numbers: inventory(0, 0),
  images: [
    { src: "/prizes/bmw-exterior.png", alt: "BMW clásico de competición, presentación visual mejorada con IA a partir de la foto original", label: "Vista exterior" },
    { src: "/prizes/bmw-engine.png", alt: "Detalle del motor preparado del BMW, foto original mejorada digitalmente", label: "Motor" },
    { src: "/prizes/bmw-cockpit.png", alt: "Puesto de conducción del BMW con volante deportivo, foto original mejorada digitalmente", label: "Puesto de conducción" },
    { src: "/prizes/bmw-interior.png", alt: "Butacas y jaula de seguridad del BMW, foto original mejorada digitalmente", label: "Interior racing" },
  ],
  features: [{ label: "Marca", value: "BMW" }, { label: "Estilo", value: "Clásico de competición" }, { label: "Preparación", value: "Equipamiento racing visible en las fotos" }, { label: "Imágenes", value: "Presentación mejorada con IA; validar estado real" }],
  promotion: { quantity: 3, totalMinor: 270_000 },
}];

export const upcomingMoto = {
  title: "Moto Racing",
  edition: "La próxima en pista",
  category: "Moto",
  image: { src: "/prizes/moto-racing.png", alt: "Imagen conceptual de una moto racing en un box de competición", label: "Moto Racing" },
} as const;

export const featuredRaffle = demoRaffles[0]!;
export function demoHref(raffle: DemoRaffle) { return `/demo/sorteos/${raffle.id}`; }
export function inventoryCounts(raffle: DemoRaffle) {
  return raffle.numbers.reduce((counts, item) => { counts[item.state]++; return counts; }, { available: 0, reserved: 0, sold: 0, blocked: 0 });
}

export function pickAvailable(raffle: DemoRaffle, selected: number[], quantity: number, random: () => number = Math.random) {
  const available = raffle.numbers.filter((n) => n.state === "available" && !selected.includes(n.number)).map((n) => n.number);
  const count = Math.min(quantity, MAX_SELECTION - selected.length, available.length);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [available[i], available[j]] = [available[j]!, available[i]!];
  }
  return available.slice(0, Math.max(0, count));
}
