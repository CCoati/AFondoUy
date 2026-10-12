import Link from "next/link";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { PageHeading } from "@/components/page-heading";
import { formatUYU } from "@/domain/raffle";

const metricSchema=z.object({raffles_active:z.number(),numbers_sold:z.number(),numbers_available:z.number(),numbers_blocked:z.number(),reservations_active:z.number(),payments_pending:z.number(),orders_paid:z.number(),revenue_confirmed_minor:z.number(),sales_by_day:z.array(z.object({day:z.string(),count:z.number(),revenue_minor:z.number()})),activity:z.array(z.object({action:z.string(),entity_id:z.string().nullable(),created_at:z.string()}))});
const activityLabel:Record<string,string>={raffle_created:"Sorteo creado",raffle_updated:"Sorteo actualizado",promotion_saved:"Promoción guardada",promotion_enabled:"Promoción activada",promotion_disabled:"Promoción desactivada",numbers_blocked:"Números bloqueados",numbers_unblocked:"Bloqueo retirado",result_recorded:"Resultado registrado",role_changed:"Acceso actualizado",platform_setting_updated:"Configuración actualizada",inventory_configured:"Inventario configurado",image_saved:"Imagen guardada"};
const date=(value:string)=>new Intl.DateTimeFormat("es-UY",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"America/Montevideo"}).format(new Date(value));

export default async function AdminPage(){
  const {db,user}=await requireAdmin();
  const {data,error}=await db.rpc("admin_dashboard_summary",{p_days:7});
  const metrics=metricSchema.safeParse(data);
  return <div className="admin-content">
    <PageHeading eyebrow="RESUMEN DE OPERACIONES" title="Panel de control."><p>Indicadores de sorteos, ventas y actividad registrados en la base de datos.</p></PageHeading>
    <div className="admin-welcome"><div><span className="admin-live-dot"/> DATOS DEL SISTEMA</div><span>Sesión protegida · {user.email ?? "Administrador"}</span></div>
    {error||!metrics.success?<div className="admin-data-warning" role="alert"><span className="admin-warning-icon">!</span><div><strong>No se pudieron cargar métricas verificadas.</strong><p>La conexión actual no coincide con el esquema del panel o falta aplicar la migración del dashboard. No mostramos cifras de demostración como actividad real.</p><Link href="/admin/sorteos" className="text-link">Abrir gestión de sorteos →</Link></div></div>:<>
      <section className="admin-metrics" aria-label="Indicadores actuales">
        <article className="admin-metric"><span>SORTEOS ACTIVOS</span><strong>{metrics.data.raffles_active}</strong><small>Publicados para participar</small></article>
        <article className="admin-metric"><span>NÚMEROS VENDIDOS</span><strong>{metrics.data.numbers_sold.toLocaleString("es-UY")}</strong><small>Asignaciones confirmadas</small></article>
        <article className="admin-metric"><span>DISPONIBLES</span><strong>{metrics.data.numbers_available.toLocaleString("es-UY")}</strong><small>{metrics.data.numbers_blocked.toLocaleString("es-UY")} bloqueados por administración</small></article>
        <article className="admin-metric admin-metric-accent"><span>INGRESOS CONFIRMADOS</span><strong>{formatUYU(metrics.data.revenue_confirmed_minor)}</strong><small>{metrics.data.orders_paid.toLocaleString("es-UY")} órdenes pagas · UYU</small></article>
        <article className="admin-metric"><span>PAGOS PENDIENTES</span><strong>{metrics.data.payments_pending}</strong><small>Órdenes que requieren seguimiento</small></article>
        <article className="admin-metric"><span>RESERVAS VIGENTES</span><strong>{metrics.data.reservations_active}</strong><small>Reservas temporales sin vencer</small></article>
      </section>
      <section className="admin-dashboard-grid">
        <article className="admin-card admin-chart"><div className="admin-card-heading"><div><p className="admin-kicker">ÚLTIMOS 7 DÍAS</p><h2>Ventas confirmadas</h2></div><span className="admin-chart-legend"><i/> Órdenes pagas</span></div>
          {metrics.data.sales_by_day.some(day=>day.count>0)?<div className="admin-bars" role="img" aria-label="Órdenes pagas por día durante los últimos siete días">{metrics.data.sales_by_day.map((day,i)=>{const max=Math.max(1,...metrics.data.sales_by_day.map(d=>d.count));return <div className="admin-bar-col" key={`${day.day}-${i}`}><strong>{day.count||""}</strong><div className="admin-bar-track"><i style={{height:`${Math.max(day.count?8:0,Math.round(day.count/max*100))}%`}}/></div><span>{new Intl.DateTimeFormat("es-UY",{weekday:"short",day:"2-digit",timeZone:"America/Montevideo"}).format(new Date(`${day.day}T12:00:00-03:00`))}</span></div>})}</div>:<div className="admin-chart-empty"><span>—</span><p>Aún no hay ventas confirmadas en este período.</p></div>}
          <div className="admin-sales-table">{metrics.data.sales_by_day.filter(d=>d.count>0).slice(-3).map(d=><div key={d.day}><span>{new Intl.DateTimeFormat("es-UY",{day:"2-digit",month:"short",timeZone:"America/Montevideo"}).format(new Date(`${d.day}T12:00:00-03:00`))}</span><span>{d.count} {d.count===1?"orden":"órdenes"}</span><strong>{formatUYU(d.revenue_minor)}</strong></div>)}</div>
        </article>
        <article className="admin-card admin-activity"><div className="admin-card-heading"><div><p className="admin-kicker">TRAZABILIDAD</p><h2>Actividad reciente</h2></div><span className="admin-card-index">01—08</span></div>{metrics.data.activity.length?<ol>{metrics.data.activity.map((item,i)=><li key={`${item.created_at}-${i}`}><span className="admin-activity-point"/><div><strong>{activityLabel[item.action]??"Acción administrativa"}</strong><small>{date(item.created_at)}{item.entity_id?` · ${item.entity_id.slice(0,8)}`:""}</small></div></li>)}</ol>:<div className="admin-chart-empty"><span>—</span><p>La auditoría aparecerá aquí al realizar cambios administrativos.</p></div>}</article>
      </section>
    </>}
    <section className="admin-quicklinks"><div><p className="admin-kicker">GESTIÓN RÁPIDA</p><h2>Operá la plataforma</h2></div><div className="admin-quick-grid">{[["Sorteos","Crear, editar y gestionar inventario","/admin/sorteos","01"],["Números","Consultar ventas y reservas","/admin/numeros","02"],["Transacciones","Revisar órdenes y pagos","/admin/transacciones","03"],["Resultados","Registrar y verificar ganadores","/admin/resultados","04"]].map(([title,body,href,n])=><Link key={href} href={href as string}><span>{n}</span><strong>{title}</strong><small>{body}</small><i>↗</i></Link>)}</div></section>
  </div>;
}
