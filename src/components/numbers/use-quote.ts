"use client";
import { useEffect, useState } from "react";
import { quoteSchema, type Quote } from "@/domain/reservation";
export function useQuote(raffleId: string | undefined, quantity: number, demo = false) {
  const [result, setResult] = useState<{ key: string; quote?: Quote; error?: string }>({ key: "" });
  const [revision, setRevision] = useState(0);
  const key = `${raffleId}:${quantity}:${revision}`;
  useEffect(() => {
    if (!raffleId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(demo ? "/api/demo/cotizacion" : "/api/cotizacion", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raffleId, quantity }), signal: AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        if (!controller.signal.aborted) setResult({ key, quote: quoteSchema.parse(body) });
      } catch (error) { if (!controller.signal.aborted) setResult({ key, error: error instanceof TypeError || error instanceof DOMException || (error instanceof Error && error.name==="ZodError") ? "No pudimos actualizar el precio. Revisá tu conexión y volvé a cotizar." : error instanceof Error ? error.message : "No pudimos calcular el total." }); }
    }
    void load(); return () => controller.abort();
  }, [raffleId, quantity, demo, key]);
  return { quote: result.key === key ? result.quote : undefined, error: result.key === key ? result.error : undefined,
    loading: !!raffleId && result.key !== key, refresh: () => setRevision(n => n+1) };
}
