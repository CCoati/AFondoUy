"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inventorySchema, type InventoryNumber } from "@/domain/reservation";
const snapshotSchema = z.object({ numbers: inventorySchema, active: z.boolean(), count: z.number().int().min(1).max(10000) });
export function useAvailability(raffleId: string) {
  const [snapshot, setSnapshot] = useState<{ numbers: InventoryNumber[]; active: boolean; count: number }>();
  const [connected, setConnected] = useState(false), [error, setError] = useState("");
  const [tick, setTick] = useState(0), generation = useRef(0);
  const refresh = useCallback(() => setTick(n => n+1), []);
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current;
    async function load() {
      try {
        const response = await fetch(`/api/sorteos/${raffleId}/numeros`, { cache: "no-store", signal: AbortSignal.any([controller.signal,AbortSignal.timeout(4000)]) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message);
        const value = snapshotSchema.parse(body);
        if (value.numbers.length !== value.count || new Set(value.numbers.map(n=>n.number)).size !== value.count) throw new Error("El inventario se está actualizando. Volvé a intentar.");
        if (version === generation.current && !controller.signal.aborted) { setSnapshot(value);setConnected(true);setError(""); }
      } catch (e) { if (!controller.signal.aborted) { setConnected(false);setError(e instanceof TypeError || e instanceof DOMException || (e instanceof Error && e.name==="ZodError") ? "No pudimos actualizar los números. Revisá tu conexión y reintentá." : e instanceof Error ? e.message : "No pudimos actualizar los números."); } }
    }
    void load(); return () => controller.abort();
  }, [raffleId,tick]);
  useEffect(() => {
    const offline = () => { setConnected(false);setError("Estás sin conexión. Conservamos tu selección; reconectate antes de reservar."); };
    const interval = setInterval(refresh,5000);
    window.addEventListener("online",refresh);window.addEventListener("focus",refresh);window.addEventListener("offline",offline);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const db = url && key ? createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
    const channel = db?.channel(`inventory:${raffleId}`).on("postgres_changes",{event:"*",schema:"public",table:"number_availability",filter:`raffle_id=eq.${raffleId}`},refresh).subscribe(status => { if(status==="SUBSCRIBED") refresh(); });
    return () => { clearInterval(interval);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);window.removeEventListener("offline",offline);if(db && channel) void db.removeChannel(channel); };
  }, [raffleId,refresh]);
  return { snapshot, connected, error, refresh };
}
