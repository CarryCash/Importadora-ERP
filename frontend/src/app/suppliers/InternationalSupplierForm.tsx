'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';

type Field = { key: string; label: string; type?: string; options?: string[]; wide?: boolean; required?: boolean };
const tabs: { id: string; title: string; fields: Field[] }[] = [
  { id: 'identity', title: 'Identificación empresarial', fields: [
    { key: 'legal_name', label: 'Razón social extranjera', required: true }, { key: 'trade_name', label: 'Nombre comercial' },
    { key: 'country_of_incorporation', label: 'País de constitución', required: true }, { key: 'entity_type', label: 'Tipo de entidad' },
    { key: 'tax_id', label: 'Número de identificación fiscal' }, { key: 'incorporation_date', label: 'Fecha de constitución', type: 'date' },
    { key: 'website', label: 'Sitio web' }, { key: 'registered_address', label: 'Dirección registrada', wide: true },
  ]},
  { id: 'fiscal', title: 'Información fiscal', fields: [
    { key: 'tax_identification_number', label: 'Tax Identification Number' }, { key: 'tax_residence_country', label: 'País de residencia fiscal' },
    { key: 'tax_id_type', label: 'Tipo de identificación fiscal' }, { key: 'billing_details', label: 'Datos de facturación', wide: true },
    { key: 'tax_documents', label: 'Documentos fiscales (referencia / nombre)', wide: true },
    { key: 'tax_verification_status', label: 'Estado de verificación', type: 'select', options: ['Pendiente', 'Validado', 'Observado'] },
  ]},
  { id: 'contacts', title: 'Contactos', fields: [
    { key: 'sales_representative', label: 'Representante comercial' }, { key: 'export_department', label: 'Departamento de exportación' },
    { key: 'email', label: 'Correo', type: 'email' }, { key: 'international_phone', label: 'Teléfono con código internacional' },
    { key: 'shipping_address', label: 'Dirección de despacho', wide: true }, { key: 'logistics_contact', label: 'Contacto logístico' },
  ]},
  { id: 'commercial', title: 'Información comercial', fields: [
    { key: 'payment_currency', label: 'Moneda de negociación', type: 'select', options: ['USD', 'EUR', 'CNY', 'JPY', 'GBP', 'HKD', 'KRW', 'TWD', 'Otra'] },
    { key: 'payment_terms', label: 'Condiciones de pago' }, { key: 'advance_percent', label: 'Porcentaje de anticipo', type: 'number' },
    { key: 'commercial_credit', label: 'Crédito comercial' }, { key: 'minimum_order_quantity', label: 'Cantidad mínima de pedido', type: 'number' },
    { key: 'production_days', label: 'Tiempo de producción (días)', type: 'number' }, { key: 'dispatch_days', label: 'Tiempo de despacho (días)', type: 'number' },
    { key: 'guarantees', label: 'Garantías' }, { key: 'discounts', label: 'Descuentos' },
    { key: 'incoterm_default', label: 'Incoterm habitual', type: 'select', options: ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] },
  ]},
  { id: 'logistics', title: 'Logística', fields: [
    { key: 'usual_origin_port', label: 'Puerto de origen habitual' }, { key: 'goods_origin_country', label: 'País de origen de mercancía' },
    { key: 'transport_methods', label: 'Métodos de transporte' }, { key: 'transit_days', label: 'Tiempo estimado de tránsito (días)', type: 'number' },
    { key: 'freight_forwarder', label: 'Agente de carga habitual' }, { key: 'packaging_conditions', label: 'Condiciones de embalaje', wide: true },
    { key: 'units_per_carton', label: 'Unidades por caja', type: 'number' }, { key: 'package_weight', label: 'Peso del embalaje' },
    { key: 'package_dimensions', label: 'Dimensiones del embalaje' },
  ]},
  { id: 'banking', title: 'Información bancaria', fields: [
    { key: 'bank_name', label: 'Banco' }, { key: 'bank_country', label: 'País del banco' }, { key: 'account_holder', label: 'Titular de cuenta' },
    { key: 'account_number', label: 'Número de cuenta', type: 'password' }, { key: 'swift_bic', label: 'SWIFT / BIC' }, { key: 'iban', label: 'IBAN (cuando aplique)' },
    { key: 'bank_currency', label: 'Moneda de cuenta', type: 'select', options: ['USD', 'EUR', 'CNY', 'JPY', 'GBP', 'Otra'] },
    { key: 'banking_documents', label: 'Documentos bancarios (referencia / nombre)', wide: true },
  ]},
  { id: 'documents', title: 'Documentación', fields: [
    { key: 'proformas', label: 'Proformas (referencia / nombre)', wide: true }, { key: 'commercial_invoices', label: 'Facturas comerciales (referencia / nombre)', wide: true },
    { key: 'origin_certificates', label: 'Certificados de origen (referencia / nombre)', wide: true }, { key: 'quality_certificates', label: 'Certificados de calidad (referencia / nombre)', wide: true },
    { key: 'contracts', label: 'Contratos (referencia / nombre)', wide: true }, { key: 'catalogs', label: 'Catálogos (referencia / nombre)', wide: true },
    { key: 'technical_sheets', label: 'Fichas técnicas (referencia / nombre)', wide: true }, { key: 'export_documentation', label: 'Documentación de exportación (referencia / nombre)', wide: true },
  ]},
  { id: 'review', title: 'Evaluación y aprobación', fields: [
    { key: 'business_verification', label: 'Verificación empresarial', type: 'select', options: ['Pendiente', 'Verificada', 'Observada'] },
    { key: 'commercial_evaluation', label: 'Evaluación comercial (0–100)', type: 'number' }, { key: 'logistics_evaluation', label: 'Evaluación logística (0–100)', type: 'number' },
    { key: 'financial_evaluation', label: 'Evaluación financiera (0–100)', type: 'number' }, { key: 'document_risks', label: 'Riesgos documentales', wide: true },
    { key: 'risk_level', label: 'Nivel de riesgo', type: 'select', options: ['unrated', 'low', 'medium', 'high', 'critical'] },
    { key: 'assigned_approver', label: 'Aprobador asignado' }, { key: 'review_notes', label: 'Observaciones', wide: true },
  ]},
];

export default function InternationalSupplierForm() {
  const router = useRouter();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('identity');
  const [profile, setProfile] = useState<Record<string, any>>({ payment_currency: 'USD', bank_currency: 'USD', tax_verification_status: 'Pendiente', business_verification: 'Pendiente', risk_level: 'unrated', incoterm_default: 'FOB' });
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (token) void fetch('/api/suppliers/categories?type=international', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []).then(setCategories).catch(() => setCategories([])); }, [token]);
  const current = tabs.find(tab => tab.id === activeTab)!;
  const setField = (key: string, value: string) => setProfile(prev => ({ ...prev, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const name = String(profile.legal_name || '').trim();
      if (name.length < 2) throw new Error('Completa la razón social en Identificación empresarial.');
      if (!String(profile.country_of_incorporation || '').trim()) throw new Error('Indica el país de constitución.');
      const response = await fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ supplier_type: 'international', country: profile.country_of_incorporation, name, legal_name: name, trade_name: profile.trade_name, tax_id: profile.tax_identification_number || profile.tax_id || null, tax_id_type: profile.tax_id_type || null, contact_person: profile.sales_representative || '', email: profile.email || '', phone: profile.international_phone || '', incoterm_default: profile.incoterm_default || 'FOB', shipping_port: profile.usual_origin_port || '', estimated_lead_time: Number(profile.transit_days || profile.production_days || 0) || null, payment_terms: profile.payment_terms || '', payment_currency: profile.payment_currency || 'USD', website: profile.website || '', category_id: categoryId || null, risk_level: profile.risk_level || 'unrated', international_profile: profile }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'No se pudo registrar el proveedor.');
      router.push('/suppliers/international');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el proveedor.'); }
    finally { setBusy(false); }
  };
  return <div className="dashboard-layout"><Navbar/><main className="international-supplier-page">
    <header className="international-heading"><div><p className="eyebrow">PROVEEDORES · INTERNACIONALES</p><h1>Registrar proveedor internacional</h1><p>Registra empresas extranjeras y sus reglas comerciales, fiscales y logísticas.</p></div><Link className="settings-secondary-button" href="/suppliers/international"><ArrowLeft size={15}/>Volver al listado</Link></header>
    <form className="international-form-card" onSubmit={save}>
      <div className="international-tabs" role="tablist">{tabs.map((tab,index)=><button type="button" role="tab" aria-selected={activeTab===tab.id} className={activeTab===tab.id?'active':''} key={tab.id} onClick={()=>setActiveTab(tab.id)}><span>{String(index+1).padStart(2,'0')}</span>{tab.title}</button>)}</div>
      <section className="international-tab-content"><div className="international-section-heading"><div><h2>{current.title}</h2><p>{activeTab==='fiscal'?'Los formatos de identificación dependen del país; se conservan como referencia y no se aplica una regla universal.':activeTab==='documents'?'Los documentos de operaciones concretas deben adjuntarse al expediente de importación.':activeTab==='review'?'El envío crea una solicitud de aprobación con la política vigente.':'Completa la información disponible; los campos fiscales no aplicables pueden quedar vacíos.'}</p></div>{activeTab==='review'&&<span className="international-pending-pill">Pendiente de aprobación</span>}</div>
        <div className="international-fields">{current.fields.map(field=><label key={field.key} className={field.wide?'wide':''}><span>{field.label}{field.required?' *':''}</span>{field.key==='category_id'?<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Sin categoría</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select>:field.key==='risk_level'?<select value={profile.risk_level||'unrated'} onChange={e=>setField(field.key,e.target.value)}>{field.options!.map(o=><option key={o} value={o}>{o==='unrated'?'Sin evaluar':o==='low'?'Bajo':o==='medium'?'Medio':o==='high'?'Alto':'Crítico'}</option>)}</select>:field.type==='select'?<select value={profile[field.key]||field.options?.[0]||''} onChange={e=>setField(field.key,e.target.value)}>{field.options!.map(option=><option key={option}>{option}</option>)}</select>:<input required={field.required} type={field.type||'text'} value={profile[field.key]||''} onChange={e=>setField(field.key,e.target.value)}/>}</label>)}{activeTab==='identity'&&<label><span>Categoría de proveedor</span><select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Sin categoría</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}</div>
      </section>
      {error&&<p className="settings-message error">{error}</p>}
      <footer className="international-form-footer"><button type="button" className="settings-secondary-button" onClick={()=>{const i=tabs.findIndex(tab=>tab.id===activeTab);if(i>0)setActiveTab(tabs[i-1].id);}} disabled={activeTab==='identity'}>Anterior</button><div><button type="button" className="settings-secondary-button" onClick={()=>{const i=tabs.findIndex(tab=>tab.id===activeTab);if(i<tabs.length-1)setActiveTab(tabs[i+1].id);}} disabled={activeTab==='review'}>Siguiente <ChevronRight size={15}/></button>{activeTab==='review'&&<button type="submit" className="settings-primary-button" disabled={busy}><Save size={15}/>{busy?'Guardando…':'Enviar a aprobación'}</button>}</div></footer>
    </form>
    <style jsx>{`.international-supplier-page{width:min(1500px,100%);margin:auto;padding:30px clamp(16px,3vw,40px) 60px}.international-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.international-heading h1{font-size:clamp(1.8rem,3vw,2.4rem);margin:4px 0}.international-heading p:last-child,.international-section-heading p{color:var(--muted-foreground);margin:5px 0}.international-form-card{border:1px solid var(--border);background:var(--card);border-radius:18px;overflow:hidden}.international-tabs{display:flex;gap:4px;overflow:auto;padding:12px;border-bottom:1px solid var(--border);background:var(--background)}.international-tabs button{display:flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid transparent;border-radius:9px;padding:11px 13px;background:transparent;color:var(--muted-foreground);font:inherit;font-weight:650;cursor:pointer;transition:background .16s,color .16s}.international-tabs button:hover:not(.active){background:var(--secondary);color:var(--foreground)}.international-tabs button:focus-visible,.international-form-footer button:focus-visible{outline:2px solid var(--action-color,var(--primary));outline-offset:2px}.international-tabs button span{font-size:.68rem;opacity:.7}.international-tabs button.active{background:var(--action-color,var(--primary));border-color:var(--action-color,var(--primary));color:var(--primary-foreground)}.international-tabs button:disabled,.international-form-footer button:disabled{opacity:.48;cursor:not-allowed}.international-tab-content{padding:26px clamp(18px,3vw,36px)}.international-section-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}.international-section-heading h2{margin:0;font-size:1.2rem}.international-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px 20px}.international-fields label{display:grid;align-content:start;gap:7px;font-size:.82rem;font-weight:650}.international-fields label.wide{grid-column:1/-1}.international-fields input,.international-fields select{height:43px;width:100%;padding:0 12px;border:1px solid var(--border);border-radius:9px;background:var(--background);color:var(--foreground);font:inherit}.international-pending-pill{padding:6px 10px;border-radius:99px;background:var(--secondary);font-size:.75rem;font-weight:700}.international-form-footer{display:flex;justify-content:space-between;gap:12px;padding:17px 24px;border-top:1px solid var(--border)}.international-form-footer>div{display:flex;gap:9px}.international-form-footer button{min-height:39px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 13px;font:inherit;font-size:.78rem;font-weight:700}.international-form-footer .settings-primary-button{border-color:var(--action-color,var(--primary));background:var(--action-color,var(--primary));color:var(--primary-foreground)}@media(max-width:720px){.international-heading{align-items:flex-start;flex-direction:column}.international-fields{grid-template-columns:1fr}.international-fields label.wide{grid-column:auto}.international-form-footer{padding:14px;flex-wrap:wrap}.international-tabs button{padding:10px}}`}</style>
  </main></div>;
}
