'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';

type Field = { key: string; label: string; type?: string; options?: string[]; wide?: boolean; required?: boolean };
const tabs: { id: string; title: string; fields: Field[] }[] = [
  { id: 'general', title: 'General', fields: [
    { key: 'person_type', label: 'Tipo de persona', type: 'select', options: ['Natural', 'Jurídica'], required: true },
    { key: 'legal_name', label: 'Razón social', required: true }, { key: 'trade_name', label: 'Nombre comercial' },
    { key: 'constitution_date', label: 'Fecha de constitución', type: 'date' }, { key: 'economic_activity', label: 'Actividad económica' },
    { key: 'category_id', label: 'Categoría', type: 'select' }, { key: 'province', label: 'Provincia' }, { key: 'canton', label: 'Cantón' },
    { key: 'city', label: 'Ciudad' }, { key: 'address', label: 'Dirección principal', wide: true },
  ]},
  { id: 'fiscal', title: 'Fiscal', fields: [
    { key: 'tax_validation_status', label: 'Validación tributaria', type: 'select', options: ['Pendiente', 'Validado manualmente', 'Observado'] },
    { key: 'tax_regime', label: 'Régimen tributario' }, { key: 'tax_obligations', label: 'Obligaciones / características tributarias', wide: true },
    { key: 'electronic_invoicing', label: 'Facturación electrónica', type: 'select', options: ['No verificada', 'Sí', 'No'] },
    { key: 'last_tax_verified_at', label: 'Última verificación', type: 'date' },
  ]},
  { id: 'contacts', title: 'Contactos', fields: [
    { key: 'contact_person', label: 'Nombre y apellido', required: true }, { key: 'contact_role', label: 'Cargo' },
    { key: 'contact_department', label: 'Departamento' }, { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo', type: 'email' },
    { key: 'billing_address', label: 'Dirección de facturación', wide: true }, { key: 'delivery_address', label: 'Dirección de despacho', wide: true },
    { key: 'business_hours', label: 'Horarios de atención', wide: true },
  ]},
  { id: 'commercial', title: 'Comercial', fields: [
    { key: 'supplied_products_services', label: 'Productos o servicios suministrados', wide: true }, { key: 'payment_terms', label: 'Condiciones de pago' },
    { key: 'credit_days', label: 'Días de crédito', type: 'number' }, { key: 'credit_limit', label: 'Límite de crédito', type: 'number' },
    { key: 'minimum_order', label: 'Pedido mínimo', type: 'number' }, { key: 'estimated_lead_time', label: 'Plazo de entrega (días)', type: 'number' },
    { key: 'discounts', label: 'Descuentos' }, { key: 'guarantees', label: 'Garantías' }, { key: 'returns_policy', label: 'Política de devoluciones', wide: true },
  ]},
  { id: 'finance', title: 'Finanzas', fields: [
    { key: 'bank_name', label: 'Institución bancaria' }, { key: 'account_holder', label: 'Titular de cuenta' },
    { key: 'account_type', label: 'Tipo de cuenta', type: 'select', options: ['Corriente', 'Ahorros', 'Otra'] },
    { key: 'account_number', label: 'Número de cuenta' }, { key: 'payment_currency', label: 'Moneda', type: 'select', options: ['USD'] },
    { key: 'bank_verification_status', label: 'Estado de verificación', type: 'select', options: ['Pendiente', 'Verificada', 'Rechazada'] },
  ]},
  { id: 'documents', title: 'Documentos', fields: [
    { key: 'tax_documents', label: 'Documentos tributarios (referencia / nombre)', wide: true }, { key: 'certificates', label: 'Certificados', wide: true },
    { key: 'contracts', label: 'Contratos', wide: true }, { key: 'quotations', label: 'Cotizaciones', wide: true },
    { key: 'bank_support', label: 'Soporte bancario', wide: true }, { key: 'document_issue_date', label: 'Fecha de emisión', type: 'date' },
    { key: 'document_expiry_date', label: 'Fecha de vencimiento', type: 'date' }, { key: 'document_validation_status', label: 'Estado de validación', type: 'select', options: ['Pendiente', 'Validado', 'Observado'] },
  ]},
  { id: 'risks', title: 'Riesgos', fields: [
    { key: 'quality_score', label: 'Calidad (0–100)', type: 'number' }, { key: 'price_score', label: 'Precio (0–100)', type: 'number' },
    { key: 'punctuality_score', label: 'Puntualidad (0–100)', type: 'number' }, { key: 'service_score', label: 'Atención (0–100)', type: 'number' },
    { key: 'document_compliance_score', label: 'Cumplimiento documental (0–100)', type: 'number' },
    { key: 'risk_level', label: 'Nivel de riesgo', type: 'select', options: ['unrated', 'low', 'medium', 'high', 'critical'] },
    { key: 'incidents', label: 'Incidencias / observaciones', wide: true },
  ]},
  { id: 'review', title: 'Revisión', fields: [
    { key: 'registration_owner', label: 'Responsable del registro' }, { key: 'assigned_approver', label: 'Aprobador asignado' },
    { key: 'review_notes', label: 'Observaciones', wide: true },
  ]},
];

export default function NationalSupplierForm() {
  const router = useRouter();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [categories, setCategories] = useState<any[]>([]);
  const [profile, setProfile] = useState<Record<string, any>>({ person_type: 'Jurídica', tax_validation_status: 'Pendiente', electronic_invoicing: 'No verificada', bank_verification_status: 'Pendiente', payment_currency: 'USD', document_validation_status: 'Pendiente', risk_level: 'unrated' });
  const [ruc, setRuc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (token) void fetch('/api/suppliers/categories?type=national', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).then(setCategories).catch(() => setCategories([])); }, [token]);
  const current = tabs.find(tab => tab.id === activeTab)!;
  const setField = (key: string, value: string) => setProfile(prev => ({ ...prev, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const name = String(profile.legal_name || '').trim();
      if (name.length < 2) throw new Error('Completa la razón social en la pestaña General.');
      if (!/^\d{13}$/.test(ruc)) throw new Error('Completa un RUC de 13 dígitos en la pestaña Fiscal.');
      const response = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ supplier_type: 'national', country: 'Ecuador', name, legal_name: name, trade_name: profile.trade_name, tax_id: ruc, tax_id_type: 'ruc', contact_person: profile.contact_person, email: profile.email, phone: profile.phone, payment_terms: profile.payment_terms, payment_currency: profile.payment_currency || 'USD', estimated_lead_time: profile.estimated_lead_time || null, category_id: profile.category_id || null, risk_level: profile.risk_level || 'unrated', national_profile: profile }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'No se pudo registrar el proveedor.');
      setNotice('Proveedor guardado y enviado al flujo de aprobación.'); router.push('/suppliers/national');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el proveedor.'); }
    finally { setBusy(false); }
  };
  return <div className="dashboard-layout"><Navbar/><main className="national-supplier-page">
    <header className="national-heading"><div><p className="eyebrow">PROVEEDORES · NACIONALES</p><h1>Registrar proveedor nacional</h1><p>Completa los datos requeridos de una empresa o persona proveedora en Ecuador.</p></div><Link className="settings-secondary-button" href="/suppliers/national"><ArrowLeft size={15}/>Volver al listado</Link></header>
    <form className="national-form-card" onSubmit={save}>
      <div className="national-tabs" role="tablist">{tabs.map((tab,index)=><button type="button" role="tab" aria-selected={activeTab===tab.id} className={activeTab===tab.id?'active':''} key={tab.id} onClick={()=>setActiveTab(tab.id)}><span>{String(index+1).padStart(2,'0')}</span>{tab.title}</button>)}</div>
      <section className="national-tab-content"><div className="national-section-heading"><div><h2>{current.title}</h2><p>{activeTab==='fiscal'?'La validación se registra como estado; no se consulta automáticamente una fuente tributaria externa.':activeTab==='review'?'El envío crea una solicitud conforme a la política de aprobación activa.':'Información del proveedor nacional.'}</p></div>{activeTab==='review'&&<span className="national-pending-pill">Pendiente de aprobación</span>}</div>
        <div className="national-fields">{current.fields.map(field=><label key={field.key} className={field.wide?'wide':''}><span>{field.label}{field.required?' *':''}</span>{field.key==='category_id'?<select value={profile.category_id||''} onChange={e=>setField(field.key,e.target.value)}><option value="">Sin categoría</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select>:field.key==='risk_level'?<select value={profile.risk_level||'unrated'} onChange={e=>setField(field.key,e.target.value)}>{field.options!.map(o=><option key={o} value={o}>{o==='unrated'?'Sin evaluar':o==='low'?'Bajo':o==='medium'?'Medio':o==='high'?'Alto':'Crítico'}</option>)}</select>:field.type==='select'?<select required={field.required} value={profile[field.key]||field.options?.[0]||''} onChange={e=>setField(field.key,e.target.value)}>{field.options!.map(option=><option key={option}>{option}</option>)}</select>:field.key==='legal_name'?<input required value={profile[field.key]||''} onChange={e=>setField(field.key,e.target.value)}/>:<input required={field.required} type={field.type||'text'} value={profile[field.key]||''} onChange={e=>setField(field.key,e.target.value)}/>}</label>)}{activeTab==='fiscal'&&<label><span>RUC *</span><input required inputMode="numeric" maxLength={13} value={ruc} onChange={e=>setRuc(e.target.value.replace(/\D/g,'').slice(0,13))} placeholder="13 dígitos"/><small>Se valida el formato de 13 dígitos; la consulta tributaria oficial queda pendiente de verificación.</small></label>}</div>
      </section>
      {error&&<p className="settings-message error">{error}</p>}{notice&&<p className="settings-message success">{notice}</p>}
      <footer className="national-form-footer"><button type="button" className="settings-secondary-button" onClick={()=>{const index=tabs.findIndex(tab=>tab.id===activeTab);if(index>0)setActiveTab(tabs[index-1].id);}} disabled={activeTab==='general'}>Anterior</button><div><button type="button" className="settings-secondary-button" onClick={()=>{const index=tabs.findIndex(tab=>tab.id===activeTab);if(index<tabs.length-1)setActiveTab(tabs[index+1].id);}} disabled={activeTab==='review'}>Siguiente <ChevronRight size={15}/></button>{activeTab==='review'&&<button type="submit" className="settings-primary-button" disabled={busy}><Save size={15}/>{busy?'Guardando…':'Enviar a aprobación'}</button>}</div></footer>
    </form>
    <style jsx>{`.national-supplier-page{width:min(1500px,100%);margin:auto;padding:30px clamp(16px,3vw,40px) 60px}.national-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.national-heading h1{font-size:clamp(1.8rem,3vw,2.4rem);margin:4px 0}.national-heading p:last-child,.national-section-heading p{color:var(--muted-foreground);margin:5px 0}.national-form-card{border:1px solid var(--border);background:var(--card);border-radius:18px;overflow:hidden}.national-tabs{display:flex;gap:4px;overflow:auto;padding:12px;border-bottom:1px solid var(--border);background:var(--background)}.national-tabs button{display:flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid transparent;border-radius:9px;padding:11px 13px;background:transparent;color:var(--muted-foreground);font:inherit;font-weight:650;cursor:pointer;transition:background .16s,color .16s,border-color .16s}.national-tabs button:hover:not(.active){background:var(--secondary);color:var(--foreground)}.national-tabs button:focus-visible,.national-form-footer button:focus-visible{outline:2px solid var(--action-color,var(--primary));outline-offset:2px}.national-tabs button span{font-size:.68rem;opacity:.7}.national-tabs button.active{background:var(--action-color,var(--primary));border-color:var(--action-color,var(--primary));color:var(--primary-foreground)}.national-tabs button:disabled,.national-form-footer button:disabled{opacity:.48;cursor:not-allowed;transform:none;filter:none}.national-tab-content{padding:26px clamp(18px,3vw,36px)}.national-section-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}.national-section-heading h2{margin:0;font-size:1.2rem}.national-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px 20px}.national-fields label{display:grid;align-content:start;gap:7px;font-size:.82rem;font-weight:650}.national-fields label.wide{grid-column:1/-1}.national-fields input,.national-fields select{height:43px;width:100%;padding:0 12px;border:1px solid var(--border);border-radius:9px;background:var(--background);color:var(--foreground);font:inherit}.national-fields small{font-size:.7rem;line-height:1.45;color:var(--muted-foreground);font-weight:450}.national-pending-pill{padding:6px 10px;border-radius:99px;background:var(--secondary);font-size:.75rem;font-weight:700}.national-form-footer{display:flex;justify-content:space-between;gap:12px;padding:17px 24px;border-top:1px solid var(--border)}.national-form-footer>div{display:flex;gap:9px}.national-form-footer button{min-height:39px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 13px;font:inherit;font-size:.78rem;font-weight:700}.national-form-footer .settings-primary-button{border-color:var(--action-color,var(--primary));background:var(--action-color,var(--primary));color:var(--primary-foreground)}@media(max-width:720px){.national-heading{align-items:flex-start;flex-direction:column}.national-fields{grid-template-columns:1fr}.national-fields label.wide{grid-column:auto}.national-form-footer{padding:14px;flex-wrap:wrap}.national-tabs button{padding:10px}}`}</style>
  </main></div>;
}
