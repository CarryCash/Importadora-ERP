'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BadgeCheck, Building2, Clock3, FileWarning, Globe2, ShieldAlert, Users } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';

type Dashboard = {
  total: number; active: number; pending: number; blocked: number; highRisk: number;
  documentsExpiring: number; highPriorityIncidents: number; national: number; international: number;
  concentration: Array<{ id: string; name: string; import_count: number }>;
};

const empty: Dashboard = { total: 0, active: 0, pending: 0, blocked: 0, highRisk: 0, documentsExpiring: 0, highPriorityIncidents: 0, national: 0, international: 0, concentration: [] };

export default function SuppliersDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Dashboard>(empty);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/suppliers/dashboard', { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'No se pudo cargar el panel de proveedores.');
      setData(result);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const metrics = [
    ['Total de proveedores', data.total, Users, 'Todos los registros vigentes'],
    ['Activos', data.active, BadgeCheck, 'Habilitados para operar'],
    ['Pendientes', data.pending, Clock3, 'Esperan revisión o aprobación'],
    ['Bloqueados', data.blocked, ShieldAlert, 'Suspendidos o bloqueados'],
    ['Riesgo alto', data.highRisk, AlertTriangle, 'Evaluación alta o crítica'],
    ['Documentos por vencer', data.documentsExpiring, FileWarning, 'Vencen en los próximos 30 días'],
    ['Nacionales', data.national, Building2, 'Proveedores de Ecuador'],
    ['Internacionales', data.international, Globe2, 'Proveedores de otros países'],
  ] as const;

  return <div className="dashboard-layout"><Navbar/><main className="dashboard-content suppliers-workspace">
    <header className="settings-page-heading"><div><p className="eyebrow">MÓDULO DE PROVEEDORES</p><h1>Panel general</h1><p>Identidad, aprobación, desempeño, riesgos y documentación en un solo lugar.</p></div></header>
    <nav className="supplier-module-links" aria-label="Espacios de proveedores">
      <Link href="/suppliers/national"><Building2 size={18}/><span><strong>Proveedores nacionales</strong><small>RUC, tributación y pagos locales · {data.national}</small></span><ArrowRight size={16}/></Link>
      <Link href="/suppliers/international"><Globe2 size={18}/><span><strong>Proveedores internacionales</strong><small>País, moneda, bancos e Incoterms · {data.international}</small></span><ArrowRight size={16}/></Link>
      <Link href="/suppliers/approvals"><Clock3 size={18}/><span><strong>Aprobaciones</strong><small>Solicitudes pendientes · {data.pending}</small></span><ArrowRight size={16}/></Link>
    </nav>
    {error && <p className="settings-message error" role="alert">{error}</p>}
    <section className="supplier-metric-grid" aria-label="Indicadores de proveedores">
      {metrics.map(([label,value,Icon,description])=><article className="supplier-metric" key={label}><span className="supplier-metric-icon"><Icon size={18}/></span><div><small>{label}</small><strong>{loading?'—':value.toLocaleString('es-EC')}</strong><span>{description}</span></div></article>)}
    </section>
    <section className="supplier-dashboard-columns">
      <article className="settings-card"><header className="settings-card-heading"><div><h2>Actividad de importación</h2><p>Volumen de operaciones registradas por proveedor. Los saldos y montos financieros oficiales se consultan en Finanzas.</p></div></header>
        {data.concentration.length ? <div className="supplier-concentration-list">{data.concentration.map((row,index)=><div key={row.id}><span><b>{index+1}</b>{row.name}</span><strong>{Number(row.import_count)} importaciones</strong></div>)}</div> : <p className="settings-modal-note">Todavía no hay importaciones registradas.</p>}
      </article>
      <article className="settings-card"><header className="settings-card-heading"><div><h2>Alertas operativas</h2><p>Requieren seguimiento por los equipos responsables.</p></div></header>
        <Link className="supplier-alert-link" href="/suppliers/approvals"><Clock3 size={17}/><span>Solicitudes de aprobación pendientes</span><strong>{data.pending}</strong></Link>
        <div className="supplier-alert-row"><AlertTriangle size={17}/><span>Incidencias de prioridad alta o crítica</span><strong>{data.highPriorityIncidents}</strong></div>
        <div className="supplier-alert-row"><FileWarning size={17}/><span>Documentos próximos a vencer</span><strong>{data.documentsExpiring}</strong></div>
      </article>
    </section>
    <style jsx>{`.suppliers-workspace{max-width:1500px;margin:auto;padding:30px clamp(16px,3vw,40px) 54px}.supplier-module-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.supplier-module-links a{display:flex;align-items:center;gap:12px;min-width:0;padding:15px;border:1px solid var(--border);border-radius:13px;background:var(--card);color:var(--foreground);text-decoration:none}.supplier-module-links a>svg:first-child{color:var(--primary)}.supplier-module-links a>svg:last-child{margin-left:auto;color:var(--muted-foreground)}.supplier-module-links span{display:grid;gap:4px;min-width:0}.supplier-module-links strong{font-size:.82rem}.supplier-module-links small{color:var(--muted-foreground);font-size:.7rem}.supplier-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.supplier-metric{display:flex;align-items:flex-start;gap:12px;min-width:0;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--card)}.supplier-metric-icon{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:11px;color:var(--primary);background:color-mix(in srgb,var(--primary) 10%,var(--card))}.supplier-metric>div{display:grid;gap:4px;min-width:0}.supplier-metric small{color:var(--muted-foreground);font-size:.7rem}.supplier-metric strong{font-size:1.35rem}.supplier-metric>div>span{color:var(--muted-foreground);font-size:.65rem}.supplier-dashboard-columns{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.supplier-concentration-list{display:grid;gap:9px}.supplier-concentration-list>div,.supplier-alert-row,.supplier-alert-link{display:flex;align-items:center;gap:10px;min-height:40px;color:var(--foreground);font-size:.78rem}.supplier-concentration-list>div>span{display:flex;align-items:center;gap:10px;flex:1}.supplier-concentration-list b{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:var(--secondary);font-size:.68rem}.supplier-alert-link{padding:8px 0;color:var(--foreground);text-decoration:none}.supplier-alert-link svg,.supplier-alert-row svg{color:var(--primary);flex:0 0 auto}.supplier-alert-link span,.supplier-alert-row span{flex:1}.supplier-alert-link strong,.supplier-alert-row strong{padding:3px 8px;border-radius:99px;background:var(--secondary)}@media(max-width:1000px){.supplier-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.supplier-dashboard-columns{grid-template-columns:1fr}}@media(max-width:700px){.supplier-module-links{grid-template-columns:1fr}.supplier-metric-grid{gap:8px}.supplier-metric{padding:12px}.supplier-metric>div>span{line-height:1.35}}`}</style>
  </main></div>;
}
