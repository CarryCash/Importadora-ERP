'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import {
  Truck, Globe, User, Mail, Phone,
  Plus, Search, RefreshCw, X, MessageSquare,
  BarChart3, Box, Anchor, Clock, DollarSign,
  Edit2, ExternalLink, ShieldCheck, ChevronRight
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  country: string;
  contact_person: string;
  email: string;
  phone: string;
  incoterm_default: string;
  shipping_port: string;
  estimated_lead_time: number;
  payment_terms: string;
  brands_handled: string;
  website: string;
  supplier_type: 'national' | 'international';
  legal_name?: string;
  trade_name?: string;
  tax_id?: string;
  tax_id_type?: string;
  supplier_status?: string;
  approval_status?: string;
  risk_level?: string;
  payment_currency?: string;
  supplier_code?: string;
  category_name?: string;
  national_profile?: Record<string, any>;
  international_profile?: Record<string, any>;
  last_purchase_at?: string;
  total_imports: number;
  created_at: string;
}

const API = '/api';
const supplierStateLabel = (status?: string) => ({ active:'Activo',draft:'Borrador',pending_approval:'Pendiente de aprobación',in_review:'En revisión',observed:'Observado',approved:'Aprobado',blocked:'Bloqueado',suspended:'Suspendido',inactive:'Inactivo',archived:'Archivado' } as Record<string,string>)[status||'']||'Borrador';

export function SupplierDirectory({ supplierType }: { supplierType: 'national' | 'international' }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [purchaseFrom, setPurchaseFrom] = useState('');
  const [purchaseTo, setPurchaseTo] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [incotermFilter, setIncotermFilter] = useState('');

  // -- Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '', country: supplierType === 'national' ? 'Ecuador' : '', contact_person: '', email: '', phone: '',
    incoterm_default: 'FOB', shipping_port: '', estimated_lead_time: 45,
    payment_terms: '', brands_handled: '', website: '', supplier_type: supplierType,
    legal_name: '', tax_id: '', tax_id_type: supplierType === 'national' ? 'ruc' : 'foreign_id'
  });
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showInsights, setShowInsights] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [suppliersRes, analyticsRes] = await Promise.all([
        fetch(`${API}/suppliers?type=${supplierType}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/reports/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supplierType]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s =>
      `${s.name} ${s.legal_name || ''} ${s.trade_name || ''} ${s.tax_id || ''} ${s.supplier_code || ''} ${s.country} ${s.contact_person} ${s.email} ${s.brands_handled || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (!statusFilter || s.supplier_status === statusFilter) &&
      (!provinceFilter || s.national_profile?.province === provinceFilter) &&
      (!cityFilter || s.national_profile?.city === cityFilter) &&
      (!categoryFilter || s.category_name === categoryFilter) &&
      (!riskFilter || s.risk_level === riskFilter) &&
      (!personFilter || s.national_profile?.person_type === personFilter) &&
      (!approvalFilter || s.approval_status === approvalFilter) &&
      (supplierType !== 'international' || !countryFilter || s.country === countryFilter) &&
      (supplierType !== 'international' || !currencyFilter || s.payment_currency === currencyFilter) &&
      (supplierType !== 'international' || !incotermFilter || s.incoterm_default === incotermFilter) &&
      (!registeredFrom || s.created_at?.slice(0,10) >= registeredFrom) &&
      (!registeredTo || s.created_at?.slice(0,10) <= registeredTo) &&
      (!purchaseFrom || (s.last_purchase_at && s.last_purchase_at.slice(0,10) >= purchaseFrom)) &&
      (!purchaseTo || (s.last_purchase_at && s.last_purchase_at.slice(0,10) <= purchaseTo))
    );
  }, [suppliers, searchTerm, statusFilter, provinceFilter, cityFilter, categoryFilter, riskFilter, personFilter, approvalFilter, registeredFrom, registeredTo, purchaseFrom, purchaseTo, supplierType, countryFilter, currencyFilter, incotermFilter]);

  const stats = useMemo(() => {
    const totalImports = suppliers.reduce((sum, s) => sum + Number(s.total_imports), 0);
    const active = suppliers.filter(s => s.supplier_status === 'active').length;
    const pending = suppliers.filter(s => ['pending','in_review'].includes(s.approval_status || '')).length;
    const mostActiveCountry = suppliers.length > 0
      ? Object.entries(suppliers.reduce((acc, s) => ({ ...acc, [s.country]: (acc[s.country] || 0) + 1 }), {} as any))
        .sort((a: any, b: any) => b[1] - a[1])[0][0]
      : 'N/A';
    return { totalImports, mostActiveCountry, count: suppliers.length, active, pending };
  }, [suppliers]);

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name, country: supplier.country, contact_person: supplier.contact_person,
        email: supplier.email, phone: supplier.phone, incoterm_default: supplier.incoterm_default,
        shipping_port: supplier.shipping_port || '', estimated_lead_time: supplier.estimated_lead_time || 45,
        payment_terms: supplier.payment_terms || '', brands_handled: supplier.brands_handled || '',
        website: supplier.website || '', supplier_type: supplier.supplier_type,
        legal_name: supplier.legal_name || '', tax_id: supplier.tax_id || '', tax_id_type: supplier.tax_id_type || (supplier.supplier_type === 'national' ? 'ruc' : 'foreign_id')
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '', country: supplierType === 'national' ? 'Ecuador' : '', contact_person: '', email: '', phone: '',
        incoterm_default: 'FOB', shipping_port: '', estimated_lead_time: 45,
        payment_terms: '', brands_handled: '', website: '', supplier_type: supplierType,
        legal_name: '', tax_id: '', tax_id_type: supplierType === 'national' ? 'ruc' : 'foreign_id'
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingSupplier ? `${API}/suppliers/${editingSupplier.id}` : `${API}/suppliers`;
      const method = editingSupplier ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Error saving supplier:', err);
    }
    setSaving(false);
  };

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />

      <div className="main-content" style={{ padding: '32px 40px' }}>
        <div className="header-row">
          <div>
            <p className="eyebrow">PROVEEDORES · {supplierType === 'national' ? 'NACIONALES' : 'INTERNACIONALES'}</p>
            <h1 className="title">Proveedores {supplierType === 'national' ? 'nacionales' : 'internacionales'}</h1>
            <p className="subtitle">Gestiona identidad, contactos y relaciones comerciales por ámbito operativo.</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link className="settings-secondary-button" href="/suppliers">Panel general</Link>
            <button className="btn-refresh" onClick={fetchData} disabled={loading}>
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
            </button>
            {supplierType === 'national' ? <Link className="settings-primary-button supplier-create-action" href="/suppliers/national/new"><Plus size={18} /> Registrar proveedor</Link> : <Link className="settings-primary-button supplier-create-action" href="/suppliers/international/new"><Plus size={18} /> Registrar proveedor</Link>}
          </div>
        </div>

        {/* Info Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><Globe size={20} /></div>
            <div className="stat-body">
              <span className="stat-label">{supplierType === 'national' ? 'Proveedores registrados' : 'Proveedores activos'}</span>
              <span className="stat-value">{supplierType === 'national' ? stats.count : stats.active}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><DollarSign size={20} /></div>
            <div className="stat-body">
              <span className="stat-label">{supplierType === 'national' ? 'Pendientes de aprobación' : 'Importaciones registradas'}</span>
              <span className="stat-value">{supplierType === 'national' ? stats.pending : stats.totalImports.toLocaleString('es-EC')}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}><Anchor size={20} /></div>
            <div className="stat-body">
              <span className="stat-label">{supplierType === 'national' ? 'Activos' : 'Origen principal'}</span>
              <span className="stat-value">{supplierType === 'national' ? stats.active : stats.mostActiveCountry}</span>
            </div>
          </div>
        </div>

        {/* ─── Sourcing Insights Section ─── */}
        {supplierType === 'international' && analytics && (
          <div className="insights-container">
            <div className="insights-header" onClick={() => setShowInsights(!showInsights)}>
              <div className="header-left">
                <BarChart3 size={20} />
                <h2>Insights de Sourcing y Abastecimiento</h2>
              </div>
              <ChevronRight size={20} style={{ transform: showInsights ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
            </div>

            {showInsights && (
              <div className="insights-grid">
                <div className="insight-card">
                  <h3><Globe size={16}/> Principales Proveedores (Inversión)</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Fábrica</th><th>Total Invertido</th></tr></thead>
                      <tbody>
                        {analytics.topSuppliers.map((s: any, i: number) => (
                          <tr key={i}>
                            <td>{s.name}</td>
                            <td className="value-text">${parseFloat(s.total_invested || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="insight-card">
                  <h3><Clock size={16}/> Tiempos de Entrega Reales (Promedio)</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Fábrica</th><th>Días (Arribo)</th></tr></thead>
                      <tbody>
                        {analytics.avgLeadTimes.length === 0 && (
                          <tr><td colSpan={2} className="empty-cell">Sin datos de arribo aún.</td></tr>
                        )}
                        {analytics.avgLeadTimes.map((l: any, i: number) => (
                          <tr key={i}>
                            <td>{l.name}</td>
                            <td className="lead-text">{Math.round(l.avg_days)} días</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="insight-card">
                  <h3><Box size={16}/> Eficiencia de Pedidos</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Fábrica</th><th>Importaciones</th></tr></thead>
                      <tbody>
                        {analytics.topSuppliers.map((s: any, i: number) => (
                          <tr key={i}>
                            <td>{s.name}</td>
                            <td className="count-text">{s.imports_count} cargas</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="filter-row national-filter-row">
          <div className="search-box">
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              placeholder={supplierType === 'national' ? 'Buscar por código, razón social, RUC, contacto...' : 'Buscar por fábrica, país o marca...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          {supplierType === 'national' && <>
            <select aria-label="Filtrar por estado" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Todos los estados</option><option value="active">Activo</option><option value="draft">Borrador</option><option value="suspended">Suspendido</option><option value="blocked">Bloqueado</option></select>
            <select aria-label="Filtrar por provincia" value={provinceFilter} onChange={e=>setProvinceFilter(e.target.value)}><option value="">Todas las provincias</option>{[...new Set(suppliers.map(s=>s.national_profile?.province).filter(Boolean))].sort().map(province=><option key={province}>{province}</option>)}</select>
            <select aria-label="Filtrar por ciudad" value={cityFilter} onChange={e=>setCityFilter(e.target.value)}><option value="">Todas las ciudades</option>{[...new Set(suppliers.map(s=>s.national_profile?.city).filter(Boolean))].sort().map(city=><option key={city}>{city}</option>)}</select>
            <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Todas las categorías</option>{[...new Set(suppliers.map(s=>s.category_name).filter(Boolean))].sort().map(category=><option key={category}>{category}</option>)}</select>
            <select aria-label="Filtrar por riesgo" value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}><option value="">Todos los riesgos</option><option value="unrated">Sin evaluar</option><option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option><option value="critical">Crítico</option></select>
            <select aria-label="Filtrar por tipo de persona" value={personFilter} onChange={e=>setPersonFilter(e.target.value)}><option value="">Natural y jurídica</option><option>Natural</option><option>Jurídica</option></select>
            <select aria-label="Filtrar por aprobación" value={approvalFilter} onChange={e=>setApprovalFilter(e.target.value)}><option value="">Todos los estados de aprobación</option><option value="pending">Pendiente</option><option value="in_review">En revisión</option><option value="approved">Aprobado</option><option value="rejected">Rechazado</option></select>
            <label className="national-date-filter">Registro desde<input type="date" value={registeredFrom} onChange={e=>setRegisteredFrom(e.target.value)}/></label><label className="national-date-filter">Registro hasta<input type="date" value={registeredTo} onChange={e=>setRegisteredTo(e.target.value)}/></label>
            <label className="national-date-filter">Última compra desde<input type="date" value={purchaseFrom} onChange={e=>setPurchaseFrom(e.target.value)}/></label><label className="national-date-filter">Última compra hasta<input type="date" value={purchaseTo} onChange={e=>setPurchaseTo(e.target.value)}/></label>
          </>}
          {supplierType === 'international' && <>
            <select aria-label="País de proveedor" value={countryFilter} onChange={e=>setCountryFilter(e.target.value)}><option value="">Todos los países</option>{[...new Set(suppliers.map(s=>s.country).filter(Boolean))].sort().map(country=><option key={country}>{country}</option>)}</select>
            <select aria-label="Moneda de negociación" value={currencyFilter} onChange={e=>setCurrencyFilter(e.target.value)}><option value="">Todas las monedas</option>{[...new Set(suppliers.map(s=>s.payment_currency).filter(Boolean))].sort().map(currency=><option key={currency}>{currency}</option>)}</select>
            <select aria-label="Incoterm" value={incotermFilter} onChange={e=>setIncotermFilter(e.target.value)}><option value="">Todos los Incoterms</option>{[...new Set(suppliers.map(s=>s.incoterm_default).filter(Boolean))].sort().map(incoterm=><option key={incoterm}>{incoterm}</option>)}</select>
            <select aria-label="Estado del proveedor" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Todos los estados</option><option value="active">Activo</option><option value="draft">Borrador</option><option value="suspended">Suspendido</option><option value="blocked">Bloqueado</option></select>
          </>}
        </div>

        {/* List */}
        {loading ? (
          <div className="loading-state">
            <RefreshCw size={40} className="spin" color="var(--border)" />
          </div>
        ) : (
          supplierType === 'national' ? <div className="national-suppliers-table-wrap"><table className="national-suppliers-table"><thead><tr><th>Código</th><th>Razón social</th><th>Nombre comercial</th><th>RUC</th><th>Persona</th><th>Provincia / ciudad</th><th>Categoría</th><th>Contacto principal</th><th>Última compra</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredSuppliers.map(s=><tr key={s.id}><td><span className="national-code">{s.supplier_code || '—'}</span></td><td><strong><Link className="supplier-profile-name" href={`/suppliers/profile/${s.id}`}>{s.legal_name || s.name}</Link></strong></td><td>{s.trade_name || s.national_profile?.trade_name || '—'}</td><td>{s.tax_id || '—'}</td><td>{s.national_profile?.person_type || '—'}</td><td>{[s.national_profile?.province,s.national_profile?.city].filter(Boolean).join(' · ') || '—'}</td><td>{s.category_name || 'Sin categoría'}</td><td>{s.contact_person || '—'}{s.email&&<small>{s.email}</small>}</td><td>{s.last_purchase_at?new Date(s.last_purchase_at).toLocaleDateString('es-EC'):'Sin compras'}</td><td><span className={`national-status ${s.supplier_status||'draft'}`}>{supplierStateLabel(s.supplier_status)}</span><small>{s.approval_status==='approved'?'Aprobado':s.approval_status==='in_review'?'En revisión':s.approval_status==='observed'?'Observado':s.approval_status==='rejected'?'Rechazado':'Pendiente'}</small></td><td><button className="p-edit-btn" aria-label={`Editar ${s.name}`} onClick={()=>handleOpenModal(s)}><Edit2 size={14}/></button></td></tr>)}</tbody></table>{!filteredSuppliers.length&&<p className="settings-modal-note">No hay proveedores nacionales que coincidan con estos filtros.</p>}</div> : supplierType === 'international' ? <div className="national-suppliers-table-wrap"><table className="national-suppliers-table"><thead><tr><th>Código</th><th>Empresa / razón social</th><th>País</th><th>Identificación fiscal</th><th>Moneda</th><th>Contacto</th><th>Categoría</th><th>Incoterm habitual</th><th>Última operación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredSuppliers.map(s=><tr key={s.id}><td><span className="national-code">{s.supplier_code||'—'}</span></td><td><strong><Link className="supplier-profile-name" href={`/suppliers/profile/${s.id}`}>{s.legal_name||s.name}</Link></strong><small>{s.trade_name||s.international_profile?.trade_name||'—'}</small></td><td>{s.country||'—'}</td><td>{s.tax_id||'—'}</td><td>{s.payment_currency||'USD'}</td><td>{s.contact_person||'—'}<small>{s.email||''}</small></td><td>{s.category_name||'Sin categoría'}</td><td>{s.incoterm_default||'—'}</td><td>{s.last_purchase_at?new Date(s.last_purchase_at).toLocaleDateString('es-EC'):'Sin operaciones'}</td><td><span className={`national-status ${s.supplier_status||'draft'}`}>{supplierStateLabel(s.supplier_status)}</span><small>{s.approval_status==='approved'?'Aprobado':s.approval_status==='in_review'?'En revisión':s.approval_status==='observed'?'Observado':s.approval_status==='rejected'?'Rechazado':'Pendiente'}</small></td><td><button className="p-edit-btn" aria-label={`Editar ${s.name}`} onClick={()=>handleOpenModal(s)}><Edit2 size={14}/></button></td></tr>)}</tbody></table>{!filteredSuppliers.length&&<p className="settings-modal-note">No hay proveedores internacionales que coincidan con estos filtros.</p>}</div> : <div className="suppliers-grid">
            {filteredSuppliers.map(s => (
              <div key={s.id} className="supplier-card-premium">
                <div className="p-header">
                  <div className="p-brand-info">
                    <div className="p-flag-box">
                      <Globe size={18} aria-hidden="true"/>
                    </div>
                    <div className="p-title-stack">
                      <h3 className="p-name">{s.name}</h3>
                      <span className="p-location">{s.country} • {s.shipping_port || 'Sin puerto definido'}</span>
                    </div>
                  </div>
                  <button className="p-edit-btn" onClick={() => handleOpenModal(s)}><Edit2 size={14} /></button>
                </div>

                <div className="p-body">
                  <div className="p-meta-grid">
                    <div className="p-meta-item">
                      <span className="p-meta-label">Incoterm</span>
                      <span className="p-meta-value highlight">{s.incoterm_default}</span>
                    </div>
                    <div className="p-meta-item">
                      <span className="p-meta-label">Plazo de entrega</span>
                      <span className="p-meta-value">{s.estimated_lead_time} días</span>
                    </div>
                  </div>

                  <div className="p-contact-section">
                    <div className="p-contact-item"><User size={14} /> <span>{s.contact_person}</span></div>
                    <div className="p-contact-item"><Mail size={14} /> <span>{s.email}</span></div>
                    <div className="p-contact-item"><Phone size={14} /> <span>{s.phone}</span></div>
                  </div>

                  {s.brands_handled && (
                    <div className="p-brands-tagline">
                      <ShieldCheck size={14} /> <span>{s.brands_handled}</span>
                    </div>
                  )}
                </div>

                <div className="p-stats-footer">
                  <div className="p-stat">
                    <span className="p-s-label">Cargas</span>
                    <span className="p-s-val">{s.total_imports}</span>
                  </div>
                  <a href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" className="p-wa-action">
                    <MessageSquare size={16} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal-panel">
              <div className="modal-header">
                <h2>{editingSupplier ? 'Editar proveedor' : `Registrar proveedor ${supplierType === 'national' ? 'nacional' : 'internacional'}`}</h2>
                <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Nombre de la Fábrica / Empresa</label>
                      <input
                        required
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej. Guangzhou Cosmetic Factory"
                      />
                    </div>
                    <div className="form-group">
                      <label>País</label>
                      <input
                        required
                        value={formData.country}
                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                        placeholder="Ej. China"
                      />
                    </div>
                    <div className="form-group">
                      <label>{supplierType === 'national' ? 'RUC' : 'Identificación tributaria extranjera'}</label>
                      <input value={formData.tax_id} onChange={e => setFormData({ ...formData, tax_id: e.target.value })} placeholder={supplierType === 'national' ? '13 dígitos' : 'Tax ID / registro fiscal'} />
                    </div>
                    <div className="form-group">
                      <label>Razón social</label>
                      <input value={formData.legal_name} onChange={e => setFormData({ ...formData, legal_name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Persona de Contacto</label>
                      <input
                        value={formData.contact_person}
                        onChange={e => setFormData({ ...formData, contact_person: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>WhatsApp / Teléfono (Incluir +)</label>
                      <input
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Correo Electrónico</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Sitio Web</label>
                      <input
                        value={formData.website}
                        onChange={e => setFormData({ ...formData, website: e.target.value })}
                      />
                    </div>
                  </div>

                  <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--secondary)' }} />

                  <div className="form-grid">
                    {supplierType === 'international' && <div className="form-group">
                      <label>Incoterm Preferido</label>
                      <select value={formData.incoterm_default} onChange={e => setFormData({ ...formData, incoterm_default: e.target.value })}>
                        <option value="FOB">FOB - Free On Board</option>
                        <option value="EXW">EXW - Ex Works</option>
                        <option value="CIF">CIF - Cost, Insurance, Freight</option>
                        <option value="CFR">CFR - Cost and Freight</option>
                      </select>
                    </div>}
                    {supplierType === 'international' && <div className="form-group">
                      <label>Puerto de Salida</label>
                      <input
                        value={formData.shipping_port}
                        onChange={e => setFormData({ ...formData, shipping_port: e.target.value })}
                        placeholder="Ej. Ningbo"
                      />
                    </div>}
                    <div className="form-group">
                      <label>Plazo de entrega (días)</label>
                      <input
                        type="number"
                        value={formData.estimated_lead_time}
                        onChange={e => setFormData({ ...formData, estimated_lead_time: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Términos de Pago</label>
                      <input
                        value={formData.payment_terms}
                        onChange={e => setFormData({ ...formData, payment_terms: e.target.value })}
                        placeholder="Ej. 30% Advance, 70% BL"
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Marcas que suministra</label>
                      <input
                        value={formData.brands_handled}
                        onChange={e => setFormData({ ...formData, brands_handled: e.target.value })}
                        placeholder="Separadas por comas"
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-save" disabled={saving}>
                    {saving ? 'Guardando...' : editingSupplier ? 'Actualizar' : 'Crear Proveedor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
        .title { font-size: 1.875rem; font-weight: 800; color: var(--foreground); letter-spacing: -0.025em; margin-bottom: 4px; }
        .subtitle { color: var(--muted-foreground); font-size: 0.95rem; }

        .btn-create { background: var(--foreground); color: white; border: none; padding: 10px 18px; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
        .btn-create:hover { background: var(--foreground); transform: translateY(-1px); }

        .btn-refresh { background: var(--card); border: 1px solid var(--border); padding: 10px; border-radius: 12px; color: var(--muted-foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .btn-refresh:hover { background: var(--background); color: var(--foreground); }

        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 32px; }
        .stat-card { background: var(--card); padding: 24px; border-radius: 20px; border: 1px solid var(--border); display: flex; align-items: center; gap: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
        .stat-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
        .stat-label { display: block; font-size: 0.85rem; color: var(--muted-foreground); font-weight: 500; }
        .stat-value { font-size: 1.5rem; font-weight: 800; color: var(--foreground); }

        .filter-row { margin-bottom: 32px; }
        .search-box { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 0 16px; display: flex; align-items: center; gap: 12px; height: 56px; max-width: 500px; transition: 0.2s; }
        .search-box:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
        .search-box input { border: none; outline: none; width: 100%; font-size: 1rem; background: transparent; color: var(--foreground); }

        .suppliers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
        
        .supplier-card { background: var(--card); border-radius: 24px; border: 1px solid var(--border); display: flex; flexDirection: column; transition: 0.3s; position: relative; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
        .supplier-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -8px rgba(0,0,0,0.05); border-color: var(--border); }

        .card-header { padding: 24px; border-bottom: 1px solid var(--muted); display: flex; justify-content: space-between; align-items: flex-start; }
        .header-main { display: flex; gap: 16px; align-items: center; }
        .flag-circle { width: 44px; height: 44px; background: var(--background); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; border: 1px solid var(--border); }
        .s-name { font-size: 1.1rem; font-weight: 700; color: var(--foreground); margin: 0; }
        .s-country { font-size: 0.8rem; color: var(--muted-foreground); font-weight: 500; }
        .btn-edit-icon { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--secondary); color: var(--muted-foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .btn-edit-icon:hover { background: var(--border); color: var(--foreground); }

        .card-body { padding: 24px; flex: 1; }
        .logistics-tags { display: flex; gap: 8px; margin-bottom: 16px; }
        .l-tag { background: var(--secondary); color: var(--muted-foreground); padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 6px; }
        .incoterm { background: #ecfdf5; color: #059669; }
        .lead { background: #fef2f2; color: #dc2626; }

        .contact-info { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .c-row { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: var(--muted-foreground); }

        .brands-box { background: var(--background); padding: 12px; border-radius: 12px; font-size: 0.8rem; color: var(--foreground); margin-bottom: 20px; border-left: 3px solid var(--border); }
        
        .stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-top: 1px solid var(--secondary); padding-top: 16px; }
        .mini-stat { display: flex; flex-direction: column; }
        .m-label { font-size: 0.7rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
        .m-value { font-size: 1rem; font-weight: 800; color: var(--foreground); }

        .card-footer { padding: 20px 24px; background: var(--background); display: flex; gap: 12px; }
        .btn-wa { flex: 1; background: #10b981; color: white; border: none; padding: 10px; border-radius: 10px; font-size: 0.85rem; font-weight: 600; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
        .btn-wa:hover { background: #059669; }
        .btn-web { width: 44px; height: 44px; background: var(--card); border: 1px solid var(--border); color: var(--muted-foreground); border-radius: 10px; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .btn-web:hover { background: var(--secondary); color: var(--foreground); }

        .loading-state { height: 400px; display: flex; align-items: center; justify-content: center; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); width: 100%; max-width: 650px; border-radius: 28px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; animation: slideUp 0.3s ease-out; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .modal-header { padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 1.25rem; font-weight: 800; color: var(--foreground); }
        .close-btn { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 50%; transition: 0.2s; }
        .close-btn:hover { background: var(--secondary); color: var(--foreground); }

        .modal-body { padding: 32px; maxHeight: 70vh; overflow-y: auto; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 0.85rem; font-weight: 600; color: var(--muted-foreground); }
        .form-group input, .form-group select { padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; outline: none; transition: 0.2s; font-size: 0.95rem; }
        .form-group input:focus { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }

        .modal-footer { padding: 24px 32px; background: var(--background); display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--secondary); }
        .btn-cancel { background: var(--card); border: 1px solid var(--border); padding: 10px 20px; border-radius: 12px; color: var(--muted-foreground); font-weight: 600; cursor: pointer; transition: 0.2s; }
        .btn-save { background: var(--foreground); border: none; color: white; padding: 10px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .btn-save:hover { background: var(--foreground); transform: translateY(-1px); }

        /* Premium Supplier Card Redesign */
        .supplier-card-premium {
          background: var(--card);
          border-radius: 20px;
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01);
        }

        .supplier-card-premium:hover {
          transform: translateY(-5px);
          border-color: var(--border);
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02);
        }

        .p-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: var(--card);
        }

        .p-brand-info { display: flex; gap: 16px; align-items: center; }
        .p-flag-box {
          width: 48px;
          height: 48px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }

        .p-title-stack { display: flex; flex-direction: column; }
        .p-name { font-size: 1.1rem; font-weight: 800; color: var(--foreground); margin: 0; }
        .p-location { font-size: 0.75rem; color: var(--muted-foreground); font-weight: 600; text-transform: uppercase; letter-spacing: 0.025em; }

        .p-edit-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: var(--secondary);
          color: var(--muted-foreground);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.2s;
        }
        .p-edit-btn:hover { background: var(--border); color: var(--foreground); }

        .p-body { padding: 0 24px 24px; }
        .p-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }

        .p-meta-item {
          padding: 10px;
          background: var(--background);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .p-meta-label { font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
        .p-meta-value { font-size: 0.85rem; font-weight: 800; color: var(--foreground); }
        .p-meta-value.highlight { color: #059669; }

        .p-contact-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 16px;
          background: var(--background);
          border-radius: 14px;
          margin-bottom: 20px;
        }

        .p-contact-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          color: var(--muted-foreground);
          font-weight: 500;
        }

        .p-brands-tagline {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 4px;
          font-size: 0.8rem;
          color: var(--muted-foreground);
          font-weight: 600;
        }

        .p-stats-footer {
          margin-top: auto;
          padding: 20px 24px;
          background: var(--background);
          border-top: 1px solid var(--secondary);
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .p-stat { display: flex; flex-direction: column; flex: 1; }
        .p-s-label { font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
        .p-s-val { font-size: 1.1rem; font-weight: 800; color: var(--foreground); }

        .p-wa-action {
          width: 44px;
          height: 44px;
          background: #10b981;
          color: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.2s;
          box-shadow: 0 4px 12px rgba(16,185,129,0.25);
        }
        .p-wa-action:hover { transform: scale(1.1); background: #059669; }

        /* Insights Section */
        .insights-container {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          margin-bottom: 32px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .insights-header {
          padding: 16px 24px;
          background: var(--background);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .header-left { display: flex; align-items: center; gap: 12px; color: var(--foreground); }
        .header-left h2 { font-size: 1rem; font-weight: 800; margin: 0; }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--secondary);
          border-top: 1px solid var(--secondary);
        }

        .insight-card { background: var(--card); padding: 24px; }
        .insight-card h3 { font-size: 0.8rem; font-weight: 800; color: var(--muted-foreground); text-transform: uppercase; margin-bottom: 20px; }
        .mini-table table { width: 100%; border-collapse: collapse; }
        .mini-table th { text-align: left; font-size: 0.7rem; color: #94a3b8; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
        .mini-table td { padding: 12px 0; font-size: 0.9rem; font-weight: 600; color: var(--foreground); border-bottom: 1px solid var(--muted); }

        .value-text { color: #059669; text-align: right; }
        .lead-text { color: #3b82f6; text-align: right; }
        .count-text { color: #6366f1; text-align: right; }

        .national-filter-row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
        .supplier-create-action { text-decoration:none; }
        .national-filter-row .search-box { flex:1 1 320px; }
        .national-filter-row select { min-height:42px; max-width:240px; padding:0 11px; border:1px solid var(--border); border-radius:9px; background:var(--card); color:var(--foreground); }
        .national-date-filter { display:grid; gap:4px; color:var(--muted-foreground); font-size:.66rem; font-weight:650; }
        .national-date-filter input { min-height:39px; padding:0 9px; border:1px solid var(--border); border-radius:9px; background:var(--card); color:var(--foreground); }
        .national-suppliers-table-wrap { overflow:auto; border:1px solid var(--border); border-radius:14px; background:var(--card); }
        .national-suppliers-table { width:100%; border-collapse:collapse; min-width:1120px; }
        .national-suppliers-table th { padding:13px 14px; text-align:left; white-space:nowrap; color:var(--muted-foreground); font-size:.7rem; text-transform:uppercase; letter-spacing:.03em; border-bottom:1px solid var(--border); }
        .national-suppliers-table td { padding:13px 14px; color:var(--foreground); font-size:.8rem; border-bottom:1px solid var(--border); vertical-align:middle; }
        .national-suppliers-table tr:last-child td { border-bottom:0; }
        .national-suppliers-table td strong,.national-suppliers-table td small { display:block; }
        .national-suppliers-table td small { margin-top:4px; color:var(--muted-foreground); font-size:.7rem; }
        .national-code { font-weight:750; color:var(--primary); white-space:nowrap; }
        .supplier-profile-name { color:var(--foreground); text-decoration:none; }
        .supplier-profile-name:hover { color:var(--action-color,var(--primary)); text-decoration:underline; }
        .national-status { display:inline-flex; padding:4px 8px; border-radius:99px; background:var(--secondary); font-size:.7rem; font-weight:700; }
        .national-status.active { color:#177245; }
        .national-status.blocked,.national-status.suspended { color:#b42318; }

        @media (max-width: 1024px) {
          .insights-grid { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
          .p-meta-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 700px) { .national-filter-row select { flex:1 1 150px; max-width:none; } }
      `}</style>
    </div>
  );
}
