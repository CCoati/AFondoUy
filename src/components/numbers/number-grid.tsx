"use client";
import { useState } from "react";
import type { InventoryNumber } from "@/domain/reservation";
import { formatNumber, MAX_SELECTION } from "@/domain/raffle";
import { Icon } from "@/components/icon";
const labels = { available: "Disponible", reserved: "Reservado", sold: "Vendido", blocked: "Bloqueado" };
export function NumberGrid({ numbers, count, selected, onChange, disabled = false, demo = false }: {
  numbers: InventoryNumber[]; count: number; selected: number[]; onChange: (numbers: number[]) => void; disabled?: boolean; demo?: boolean;
}) {
  const [page, setPage] = useState(0), [search, setSearch] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false), [quantity, setQuantity] = useState("3");
  const [message, setMessage] = useState("Elegir un número no lo reserva. La reserva se realiza al iniciar checkout.");
  const currentPage = Math.min(page, Math.ceil(count/50)-1);
  const visible = numbers.filter(n => search ? n.number === Number(search) : n.number > currentPage*50 && n.number <= (currentPage+1)*50).filter(n => !onlyAvailable || n.state === "available");
  const remaining = Math.min(MAX_SELECTION-selected.length, numbers.filter(n => n.state === "available" && !selected.includes(n.number)).length);
  const validQuantity = /^\d+$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= remaining;
  function toggle(number: number) {
    if (selected.includes(number)) { onChange(selected.filter(n => n !== number)); setMessage(`Quitaste el número ${formatNumber(number,count)}.`); }
    else if (selected.length >= MAX_SELECTION) setMessage(`Podés elegir hasta ${MAX_SELECTION} números por reserva.`);
    else { onChange([...selected,number]); setMessage(`Agregaste el número ${formatNumber(number,count)}. Todavía no está reservado.`); }
  }
  function random() {
    if (!validQuantity) return;
    const pool = numbers.filter(n => n.state === "available" && !selected.includes(n.number)).map(n => n.number);
    for (let i=pool.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j]!,pool[i]!]; }
    const chosen = pool.slice(0,Number(quantity)); onChange([...selected,...chosen]);
    setMessage(`Elegimos ${chosen.map(n => formatNumber(n,count)).join(", ")}. La selección aún no constituye una reserva.`);
  }
  return <div className="selector-panel"><div className="selector-toolbar"><div className="number-search"><label htmlFor="number-search">Buscá tu número</label><div><Icon name="search" /><input id="number-search" inputMode="numeric" value={search} maxLength={String(count).length} placeholder="Ej. 027" onChange={e => setSearch(e.target.value.replace(/\D/g,""))} />{search && <button aria-label="Limpiar búsqueda" onClick={() => setSearch("")}><Icon name="close" /></button>}</div></div><div className="random-control"><label htmlFor="random-quantity">¿Cuántos elegimos al azar?</label><div><input id="random-quantity" type="number" min={1} max={Math.max(1,remaining)} value={quantity} onChange={e => setQuantity(e.target.value)} aria-describedby="random-help" /><button className="button secondary" disabled={disabled || !validQuantity} onClick={random}><Icon name="shuffle" />Elegir números al azar</button></div><small id="random-help">Podés agregar hasta {remaining} números.</small></div></div>
    <div className="number-tools"><div className="legend"><span><i className="selected" />Elegido</span>{Object.entries(labels).map(([state,label]) => <span key={state}><i className={state} />{label}</span>)}</div><label className="filter-checkbox"><input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} />Solo disponibles</label></div>
    <div className="number-pages" role="group" aria-label="Rango de números">{Array.from({length: Math.ceil(count/50)},(_,i) => <button key={i} aria-pressed={!search && currentPage===i} onClick={() => {setPage(i);setSearch("");}}>{formatNumber(i*50+1,count)}–{formatNumber(Math.min((i+1)*50,count),count)}</button>)}</div>
    <div className="number-grid" aria-label={`Números del sorteo${demo ? " de demostración" : ""}`}>{visible.map(({number,state}) => <button key={number} className={`number-tile ${state}`} disabled={disabled || state!=="available"} aria-pressed={selected.includes(number)} aria-label={`Número ${formatNumber(number,count)}, ${selected.includes(number)?"elegido":labels[state].toLowerCase()}`} onClick={() => toggle(number)}>{formatNumber(number,count)}{selected.includes(number) && <Icon name="check" />}{state==="reserved" && <span className="reserved-dot" aria-hidden="true" />}{state==="blocked" && <span className="block-mark" aria-hidden="true">×</span>}</button>)}</div>
    {!visible.length && <p className="number-empty">No hay números que coincidan. Probá otro rango o quitá el filtro.</p>}
    <div className="selector-bottom"><p role="status">{message}</p><span>{selected.length}/{MAX_SELECTION} elegidos</span></div><button className="text-link clear-selection" disabled={disabled || !selected.length} onClick={() => {onChange([]);setMessage("Limpiaste tu selección.");}}>Limpiar selección <Icon name="close" /></button>
  </div>;
}
