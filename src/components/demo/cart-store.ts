"use client";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { demoRaffles } from "@/domain/demo";
import { MAX_SELECTION } from "@/domain/raffle";

type Cart = { raffleId: string | null; numbers: number[] };
const empty: Cart = { raffleId: null, numbers: [] };
const key = "afondo.design-demo.selection.v1";
const schema = z.object({ raffleId: z.string().nullable(), numbers: z.array(z.number().int()).max(MAX_SELECTION) });
let snapshot: Cart = empty;
let serialized: string | null = null;
let storageAvailable = true;
const listeners = new Set<() => void>();

function readSnapshot(): Cart {
  if (!storageAvailable) return snapshot;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === serialized) return snapshot;
    serialized = raw;
    const parsed = schema.safeParse(raw ? JSON.parse(raw) : empty);
    const raffle = parsed.success ? demoRaffles.find((r) => r.id === parsed.data.raffleId) : undefined;
    snapshot = parsed.success && raffle ? { raffleId: raffle.id, numbers: [...new Set(parsed.data.numbers)].filter((number) => raffle.numbers.some((n) => n.number === number && n.state === "available")).sort((a, b) => a - b) } : empty;
  } catch { snapshot = empty; }
  return snapshot;
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDemoCart() { return useSyncExternalStore(subscribe, readSnapshot, () => empty); }
export function saveDemoCart(raffleId: string, numbers: number[]) {
  const raffle = demoRaffles.find((r) => r.id === raffleId);
  if (!raffle) return;
  snapshot = { raffleId, numbers: [...new Set(numbers)].filter((number) => raffle.numbers.some((n) => n.number === number && n.state === "available")).sort((a, b) => a - b).slice(0, MAX_SELECTION) };
  serialized = JSON.stringify(snapshot);
  try { sessionStorage.setItem(key, serialized); } catch { storageAvailable = false; }
  listeners.forEach((listener) => listener());
}
