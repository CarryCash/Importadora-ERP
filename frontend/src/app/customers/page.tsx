'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Navbar from '../../components/Navbar';
import {
  Users, Plus, X, Search, ChevronRight,
  TrendingUp, CreditCard,
  AlertCircle, CheckCircle,
  RefreshCw, MapPin, Briefcase, FileText,
  DollarSign, Landmark,
  User, Edit, Trash2, MessageSquare, Clock
} from 'lucide-react';
import { validateEcuadorianID } from '../../lib/ecuador-id-validator';
import { ecuadorData } from '../../lib/ecuador-data';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  code?: string;
  party_type?: 'natural' | 'legal';
  trade_name?: string | null;
  legal_representative?: string | null;
  country_code?: string;
  is_active?: boolean;
  name: string;
  email: string;
  phone: string;
  address: string;
  identification_type: 'RUC' | 'CEDULA' | 'PASAPORTE';
  identification_number: string;
  business_name: string;
  customer_type: string;
  credit_limit: number;
  payment_terms: number;
  province: string;
  city: string;
  sri_regime: string;
  price_list_level: string;
  default_discount: number;
  visit_days: string;
  latitude: number | null;
  longitude: number | null;
  special_notes: string;
  last_order_date: string | null;
  balance: number;
  created_at: string;
}

interface StatementItem {
  id: string;
  sale_number: string;
  sale_date: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
}

const API = '/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const IdentificationBadge = ({ type, number }: { type: string; number: string }) => {
  const colors: Record<string, string> = { RUC: '#0369a1', CEDULA: '#c2410c', PASAPORTE: '#7c3aed' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: colors[type] || 'var(--muted-foreground)' }}>{type}</span>
      <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{number}</span>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ─ Filters
  const [filterProvince, setFilterProvince] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementData, setStatementData] = useState<StatementItem[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showInsights, setShowInsights] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterBalance, setFilterBalance] = useState('all');
  const [profileData, setProfileData] = useState<any>(null);
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditForm, setCreditForm] = useState({ credit_limit: 0, payment_terms: 0, reason: '' });
  const [relationshipType, setRelationshipType] = useState<'contact' | 'address' | null>(null);
  const [relationshipForm, setRelationshipForm] = useState<any>({});
  const [editingRelationship, setEditingRelationship] = useState<string | null>(null);

  // ─ Form State
  const [formData, setFormData] = useState({
    name: '',
    party_type: 'natural',
    email: '',
    phone: '',
    address: '',
    identification_type: 'CEDULA',
    identification_number: '',
    business_name: '',
    customer_type: 'Minorista',
    credit_limit: 0,
    payment_terms: 0,
    province: '',
    city: '',
    sri_regime: 'RIMPE',
    price_list_level: 'Público',
    default_discount: 0,
    visit_days: '',
    latitude: '' as any,
    longitude: '' as any,
    special_notes: '',
    trade_name: '',
    legal_representative: '',
    country_code: 'EC'
  });

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const query = new URLSearchParams({ page: String(page), pageSize: '25', search: searchTerm, status: filterStatus, type: filterType, province: filterProvince, balance: filterBalance });
      const [customersRes, analyticsRes] = await Promise.all([
        fetch(`${API}/customers?${query}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/customers/analytics`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (customersRes.ok) { const result = await customersRes.json(); setCustomers(result.items || []); setTotalCustomers(Number(result.total) || 0); }
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch {
      showToast('Error cargando datos', 'err');
    }
    setLoading(false);
  }, [page, searchTerm, filterStatus, filterType, filterProvince, filterBalance]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    // Check validation as requested by user - STRICT
    const validation = validateEcuadorianID(formData.identification_number);
    if (['RUC', 'CEDULA'].includes(formData.identification_type) && !validation.isValid) {
      return showToast(`ID Inválido: ${validation.error}`, 'err');
    }

    if (!formData.name) {
      return showToast('Indica el nombre o razón social del cliente', 'err');
    }

    setSubmitting(true);
    try {
      const url = editingCustomer ? `${API}/customers/${editingCustomer.id}` : `${API}/customers`;
      const method = editingCustomer ? 'PATCH' : 'POST';

      const { credit_limit: _creditLimit, payment_terms: _terms, ...masterData } = formData;
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(masterData),
      });
      if (res.ok) {
        showToast(`Cliente ${editingCustomer ? 'actualizado' : 'registrado'} con éxito`, 'ok');
        setShowModal(false);
        setEditingCustomer(null);
        fetchData();
        setFormData({
          name: '', party_type: 'natural', email: '', phone: '', address: '',
          identification_type: 'CEDULA', identification_number: '',
          business_name: '', customer_type: 'Minorista', credit_limit: 0,
          payment_terms: 0, province: '', city: '', sri_regime: 'RIMPE',
          price_list_level: 'Público', default_discount: 0, visit_days: '',
          latitude: '' as any, longitude: '' as any, special_notes: '', trade_name: '', legal_representative: '', country_code: 'EC'
        });
      } else {
        const data = await res.json();
        showToast(data.message || 'Error al guardar', 'err');
      }
    } catch {
      showToast('Error de conexión', 'err');
    }
    setSubmitting(false);
  };

  const handleEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name || '',
      party_type: c.party_type || 'natural',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      identification_type: c.identification_type || 'CEDULA',
      identification_number: c.identification_number || '',
      business_name: c.business_name || '',
      trade_name: c.trade_name || '', legal_representative: c.legal_representative || '', country_code: c.country_code || 'EC',
      customer_type: c.customer_type || 'Minorista',
      credit_limit: c.credit_limit || 0,
      payment_terms: c.payment_terms || 0,
      province: c.province || '',
      city: c.city || '',
      sri_regime: c.sri_regime || 'RIMPE',
      price_list_level: c.price_list_level || 'Público',
      default_discount: c.default_discount || 0,
      visit_days: c.visit_days || '',
      latitude: c.latitude || '' as any,
      longitude: c.longitude || '' as any,
      special_notes: c.special_notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Desactivar al cliente "${name}"? Se conservarán su historial de ventas y sus documentos.`)) return;

    try {
      const res = await fetch(`${API}/customers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        showToast('Cliente desactivado; su historial se conservó', 'ok');
        fetchData();
      } else {
        showToast('Error al eliminar', 'err');
      }
    } catch {
      showToast('Error de conexión', 'err');
    }
  };

  const handleStatement = async (c: Customer) => {
    setStatementCustomer(c);
    setLoadingStatement(true);
    try {
      const res = await fetch(`${API}/customers/${c.id}/statement`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setStatementData(await res.json());
    } catch {
      showToast('Error cargando estado de cuenta', 'err');
    }
    setLoadingStatement(false);
  };

  const openProfile = async (c: Customer) => { try { const res = await fetch(`${API}/customers/${c.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); if (!res.ok) throw new Error('No se pudo abrir el perfil del cliente.'); setProfileData(await res.json()); } catch (e) { showToast(e instanceof Error ? e.message : 'Error al cargar la ficha.', 'err'); } };
  const submitRelationship = async () => { if (!profileData || !relationshipType) return; const segment = relationshipType === 'contact' ? 'contacts' : 'addresses'; try { const res = await fetch(`${API}/customers/${profileData.id}/${segment}${editingRelationship ? `/${editingRelationship}` : ''}`, { method: editingRelationship ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(relationshipForm) }); const body = await res.json(); if (!res.ok) throw new Error(body.message || 'No se pudo guardar.'); setRelationshipType(null); setRelationshipForm({}); setEditingRelationship(null); const fresh = await fetch(`${API}/customers/${profileData.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); if (fresh.ok) setProfileData(await fresh.json()); showToast(editingRelationship ? 'Información actualizada.' : 'Información agregada al perfil.', 'ok'); } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo guardar.', 'err'); } };
  const deactivateRelationship = async (type: 'contact' | 'address', recordId: string) => { if (!profileData || !confirm('¿Desactivar este registro? Se conservará en el historial del cliente.')) return; const segment = type === 'contact' ? 'contacts' : 'addresses'; try { const res = await fetch(`${API}/customers/${profileData.id}/${segment}/${recordId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); const body = await res.json(); if (!res.ok) throw new Error(body.message || 'No se pudo desactivar.'); const fresh = await fetch(`${API}/customers/${profileData.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); if (fresh.ok) setProfileData(await fresh.json()); showToast('Registro desactivado; historial conservado.', 'ok'); } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo desactivar.', 'err'); } };
  const submitCredit = async () => { if (!creditCustomer) return; if (!creditForm.reason.trim()) return showToast('El cambio de cupo necesita un motivo.', 'err'); try { const res = await fetch(`${API}/customers/${creditCustomer.id}/credit-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(creditForm) }); const body = await res.json(); if (!res.ok) throw new Error(body.message || 'No tienes permiso para solicitar crédito.'); showToast('Solicitud enviada; el cupo cambiará cuando la apruebe otra persona autorizada.', 'ok'); setCreditCustomer(null); if (profileData?.id === creditCustomer.id) void openProfile(creditCustomer); fetchData(); } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo enviar la solicitud.', 'err'); } };
  const reviewCredit = async (requestId: string, decision: 'approved' | 'rejected', customer: Customer) => { const note = window.prompt(decision === 'approved' ? 'Nota de aprobación (opcional)' : 'Motivo del rechazo'); if (decision === 'rejected' && !note?.trim()) return showToast('Indica el motivo del rechazo.', 'err'); try { const res = await fetch(`${API}/customers/${customer.id}/credit-requests/${requestId}/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ decision, review_note: note || null }) }); const body = await res.json(); if (!res.ok) throw new Error(body.message || 'No tienes permiso para aprobar.'); await openProfile(customer); fetchData(); showToast(decision === 'approved' ? 'Crédito aprobado y aplicado.' : 'Solicitud rechazada.', 'ok'); } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo revisar la solicitud.', 'err'); } };
  const exportCustomers = async () => { try { const res = await fetch(`${API}/customers/export.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'No tienes permiso para exportar.'); } const blob = await res.blob(), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'clientes.csv'; a.click(); URL.revokeObjectURL(url); } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo exportar la lista.', 'err'); } };
  const importCustomers = async (file?: File) => { if (!file) return; if (!file.name.toLowerCase().endsWith('.csv')) return showToast('Por ahora la importación admite archivos CSV.', 'err'); try { const csv = await file.text(), res = await fetch(`${API}/customers/import.csv`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ csv }) }), result = await res.json(); if (!res.ok) throw new Error(result.message || 'No se pudo importar el archivo.'); showToast(`Importados: ${result.imported}. Con errores: ${result.failed}.${result.errors?.[0] ? ` Fila ${result.errors[0].row}: ${result.errors[0].message}` : ''}`, result.failed ? 'err' : 'ok'); fetchData(); } catch (e) { showToast(e instanceof Error ? e.message : 'No se pudo importar.', 'err'); } };

  const shareStatementWhatsApp = () => {
    if (!statementCustomer) return;
    const pendingBalance = statementData.reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount)), 0);
    const invoices = statementData.map(i => i.sale_number).join(', ');
    const text = `Hola *${statementCustomer.business_name || statementCustomer.name}*, te adjunto tu estado de cuenta de *Importadora*. \n\n*Saldo Pendiente:* ${fmt(pendingBalance)}\n*Facturas:* ${invoices}\n\nPor favor contáctanos para coordinar el pago. ¡Gracias!`;
    window.open(`https://wa.me/${statementCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const filtered = customers;

  const availableCantons = useMemo(() => {
    const prov = ecuadorData.provincias.find(p => p.nombre === formData.province);
    return prov ? prov.cantones : [];
  }, [formData.province]);

  const stats = {
    total: Number(analytics?.summary?.customer_count) || totalCustomers,
    receivables: Number(analytics?.summary?.receivables) || 0,
    overdue: Number(analytics?.summary?.overdue_customers) || 0,
    newMonth: Number(analytics?.summary?.new_this_month) || 0
  };

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />
      <div className="customers-page">
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === 'ok' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{toast.msg}</span>
          </div>
        )}

        <div className="page-header">
          <div>
            <h1>Cartera de Clientes</h1>
            <p className="page-subtitle">Gestión de distribuidores y puntos de venta en Ecuador</p>
          </div>
          <div className="header-actions">
            <label className="btn-secondary import-button"><Plus size={16} /> Importar CSV<input type="file" accept=".csv,text/csv" onChange={e => { void importCustomers(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
            <button className="btn-secondary" onClick={() => void exportCustomers()}><FileText size={16} /> Exportar CSV</button>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={18} /> Nuevo Cliente
            </button>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}><Users size={20} /></div>
            <div className="stat-info">
              <span className="stat-label">Clientes en resultados</span>
              <span className="stat-value">{stats.total}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><CreditCard size={20} /></div>
            <div className="stat-info">
              <span className="stat-label">Cartera pendiente estimada</span>
              <span className="stat-value">{fmt(stats.receivables)}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><AlertCircle size={20} /></div>
            <div className="stat-info">
              <span className="stat-label">Clientes con saldo vencido estimado</span>
              <span className="stat-value">{stats.overdue}</span>
            </div>
          </div>
          <div className="stat-card"><div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}><Plus size={20} /></div><div className="stat-info"><span className="stat-label">Nuevos este mes</span><span className="stat-value">{stats.newMonth}</span></div></div>
        </div>

        {/* ─── Insights Section ─── */}
        {analytics && (
          <div className="insights-container">
            <div className="insights-header" onClick={() => setShowInsights(!showInsights)}>
              <div className="header-left">
                <TrendingUp size={20} />
                <h2>Insights de Cartera y Comportamiento</h2>
              </div>
              <ChevronRight size={20} style={{ transform: showInsights ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
            </div>

            {showInsights && (
              <div className="insights-grid">
                <div className="insight-card">
                  <h3><AlertCircle size={16} /> Cuentas por Cobrar (Top Deuda)</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Cliente</th><th>Saldo</th></tr></thead>
                      <tbody>
                        {analytics.debtors.map((d: any, i: number) => (
                          <tr key={i}>
                            <td>{d.name}</td>
                            <td className="debt-val">{fmt(d.total_debt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="insight-card">
                  <h3><Users size={16} /> Top Compradores</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Cliente</th><th>Total Compra</th></tr></thead>
                      <tbody>
                        {analytics.topCustomers.map((c: any, i: number) => (
                          <tr key={i}>
                            <td>{c.name}</td>
                            <td className="spent-val">{fmt(c.total_spent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="insight-card">
                  <h3>⏳ Clientes por Recuperar (Inactivos)</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Cliente</th><th>Última Vez</th></tr></thead>
                      <tbody>
                        {analytics.inactiveCustomers.map((c: any, i: number) => (
                          <tr key={i}>
                            <td>{c.name}</td>
                            <td><span className="last-seen-tag">{c.last_purchase ? new Date(c.last_purchase).toLocaleDateString() : 'N/A'}</span></td>
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

        <div className="filters-bar">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Buscar por nombre, RUC o Cédula..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            />
          </div>
          <div className="filter-group">
            <select value={filterProvince} onChange={e => { setFilterProvince(e.target.value); setPage(1); }}>
              <option value="all">Sectores (Provincias)</option>
              {ecuadorData.provincias.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
            </select>
            <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
              <option value="all">Tipos de Cliente</option>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
              <option value="Distribuidor">Distribuidor</option>
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} aria-label="Estado del cliente">
              <option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos los estados</option>
            </select>
            <select value={filterBalance} onChange={e => { setFilterBalance(e.target.value); setPage(1); }} aria-label="Estado de cartera">
              <option value="all">Toda la cartera</option><option value="debt">Con saldo pendiente</option><option value="overdue">Con vencidos</option><option value="clear">Sin deuda</option>
            </select>
          </div>
        </div>

        <div className="table-card">
          {loading ? (
            <div className="loading-state"><RefreshCw size={24} className="spin" /><span>Cargando cartera...</span></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><Users size={48} /><h3>Sin clientes</h3><p>Comienza a registrar tu red de distribución</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Identificación</th>
                  <th>Razón Social / Nombre</th>
                  <th>Ubicación</th>
                  <th>Segmento / tarifa</th>
                  <th>Crédito y saldo</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(customer => (
                  <tr key={customer.id} className="table-row">
                    <td><strong>{customer.code || '—'}</strong></td>
                    <td>
                      <IdentificationBadge
                        type={customer.identification_type}
                        number={customer.identification_number}
                      />
                    </td>
                    <td>
                      <div className="customer-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{customer.business_name || customer.name}</strong>
                          {(() => {
                            if (!customer.last_order_date) return null;
                            const days = Math.floor((new Date().getTime() - new Date(customer.last_order_date).getTime()) / (1000 * 3600 * 24));
                            if (days > 60) return <span className="loyalty-tag critical" title={`Última compra hace ${days} días`}><Clock size={10} /> Crítico</span>;
                            if (days > 30) return <span className="loyalty-tag inactive" title={`Última compra hace ${days} días`}><Clock size={10} /> Inactivo</span>;
                            return null;
                          })()}
                        </div>
                        {customer.business_name && <span className="sub-text">{customer.name}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="location-info">
                        <MapPin size={12} />
                        <span>{customer.city}, {customer.province}</span>
                        {customer.latitude && customer.longitude && (
                          <a
                            href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="maps-link"
                            title="Ver en Google Maps"
                          >
                            <RefreshCw size={12} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="price-level-cell">
                        <span className={`price-badge ${(customer.price_list_level || '').toLowerCase()}`}>
                          {customer.price_list_level}
                        </span>
                        {Number(customer.default_discount) > 0 && (
                          <span className="discount-tag">-{customer.default_discount}%</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="credit-info">
                        <span className={`type-badge ${(customer.customer_type || '').toLowerCase()}`}>{customer.customer_type || 'N/A'}</span>
                        <span className="sub-text">{customer.price_list_level || 'Público'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="credit-info">
                        <span className="amount">{fmt(customer.credit_limit)}</span>
                        {Number(customer.balance) > 0 ? (
                          <span className="balance-debt" title="Saldo Pendiente">Deuda: {fmt(customer.balance)}</span>
                        ) : (
                          <span className="balance-ok">Al día</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="contact-info">
                        <span>{customer.phone}</span>
                        {customer.visit_days && <span className="visit-days-tag">{customer.visit_days}</span>}
                      </div>
                    </td>
                    <td><span className={`type-badge ${customer.is_active === false ? 'minorista' : 'mayorista'}`}>{customer.is_active === false ? 'Inactivo' : 'Activo'}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-icon" onClick={() => void openProfile(customer)} title="Ficha 360°"><User size={16} /></button>
                        <button className="btn-icon statement" onClick={() => handleStatement(customer)} title="Estado de Cuenta">
                          <FileText size={16} />
                        </button>
                        <button className="btn-icon edit" onClick={() => handleEdit(customer)} title="Editar">
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon" onClick={() => { setCreditCustomer(customer); setCreditForm({ credit_limit: Number(customer.credit_limit) || 0, payment_terms: Number(customer.payment_terms) || 0, reason: '' }); }} title="Gestionar crédito"><CreditCard size={16} /></button>
                        <button className="btn-icon delete" onClick={() => handleDelete(customer.id, customer.name)} title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="pagination-bar">
          <span>{totalCustomers} clientes · Página {page} de {Math.max(1, Math.ceil(totalCustomers / 25))}</span>
          <div><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</button><button className="btn-secondary" disabled={page >= Math.ceil(totalCustomers / 25)} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal-panel">
              <div className="modal-header">
                <h2><Users size={20} /> {editingCustomer ? 'Editar Cliente' : 'Registro de Nuevo Cliente'}</h2>
                <button className="modal-close" onClick={() => { setShowModal(false); setEditingCustomer(null); }}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="modal-grid">
                  {/* Basic Info */}
                  <div className="section-title"><User size={16} /> Datos Personales / Contacto</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Tipo de persona</label>
                      <select value={formData.party_type} onChange={e => setFormData({ ...formData, party_type: e.target.value as 'natural' | 'legal' })}><option value="natural">Persona natural</option><option value="legal">Persona jurídica</option></select>
                    </div>
                    <div className="form-group">
                      <label>Nombre del Contacto *</label>
                      <input
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Juan Pérez"
                      />
                    </div>
                    <div className="form-group">
                      <label>Correo Electrónico</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@ejemplo.com"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Teléfono / WhatsApp</label>
                      <input
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="09XXXXXXXX"
                      />
                    </div>
                    <div className="form-group">
                      <label>Dirección Física</label>
                      <input
                        value={formData.address}
                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Calle, Número, Referencia"
                      />
                    </div>
                  </div>

                  {/* Identification */}
                  <div className="section-title"><FileText size={16} /> Datos de Facturación (SRI)</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Tipo de Documento</label>
                      <select
                        value={formData.identification_type}
                        onChange={e => setFormData({ ...formData, identification_type: e.target.value as any })}
                      >
                        <option value="CEDULA">Cédula</option>
                        <option value="RUC">RUC</option>
                        <option value="PASAPORTE">Pasaporte</option>
                        <option value="OTHER">Otro documento</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Número de Identificación *</label>
                      <input
                        value={formData.identification_number}
                        onChange={e => setFormData({ ...formData, identification_number: e.target.value })}
                        placeholder="17XXXXXXXX / 17XXXXXXXX001"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Razón Social (Si aplica)</label>
                      <input
                        value={formData.business_name}
                        onChange={e => setFormData({ ...formData, business_name: e.target.value })}
                        placeholder="Ej: Cosméticos del Ecuador S.A."
                      />
                    </div>
                    <div className="form-group">
                      <label>Régimen SRI</label>
                      <select
                        value={formData.sri_regime}
                        onChange={e => setFormData({ ...formData, sri_regime: e.target.value })}
                      >
                        <option value="RIMPE">RIMPE (General/Popular)</option>
                        <option value="GENERAL">Régimen General</option>
                        <option value="ESPECIAL">Contribuyente Especial</option>
                        <option value="RETENCION">Agente de Retención</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Nombre comercial</label><input value={formData.trade_name} onChange={e => setFormData({ ...formData, trade_name: e.target.value })} placeholder="Marca o nombre del local" /></div>
                    <div className="form-group"><label>Representante legal</label><input value={formData.legal_representative} onChange={e => setFormData({ ...formData, legal_representative: e.target.value })} placeholder="Cuando aplique" /></div>
                  </div>

                  {/* Business & Logistics */}
                  <div className="section-title"><Landmark size={16} /> Parámetros Comerciales y Ubicación</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Tipo de Cliente</label>
                      <select
                        value={formData.customer_type}
                        onChange={e => setFormData({ ...formData, customer_type: e.target.value })}
                      >
                        <option value="Minorista">Minorista</option>
                        <option value="Mayorista">Mayorista / Distribuidor</option>
                        <option value="Farmacia">Chain / Farmacia</option>
                        <option value="Salon">Salón de Belleza / Spa</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Límite de Crédito ($)</label>
                      <input
                        type="number"
                        value={formData.credit_limit}
                        disabled
                      />
                      <small>El crédito inicia en cero. Un usuario autorizado lo configura después del registro.</small>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Provincia *</label>
                      <select
                        value={formData.province}
                        onChange={e => setFormData({ ...formData, province: e.target.value, city: '' })}
                      >
                        <option value="">— Seleccionar —</option>
                        {ecuadorData.provincias.map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Ciudad / Cantón *</label>
                      <select
                        value={formData.city}
                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                        disabled={!formData.province}
                      >
                        <option value="">— Seleccionar —</option>
                        {availableCantons.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Condiciones de Pago (Días)</label>
                    <input
                      type="number"
                      value={formData.payment_terms}
                      disabled
                      placeholder="0 para pago inmediato"
                    />
                    <small>El plazo se aprueba desde la gestión de crédito del cliente.</small>
                  </div>

                  {/* CRM Advanced Section */}
                  <div className="section-title"><TrendingUp size={16} /> Inteligencia Comercial y Rutas</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Nivel de Precio (Lista)</label>
                      <select
                        value={formData.price_list_level}
                        onChange={e => setFormData({ ...formData, price_list_level: e.target.value })}
                      >
                        <option value="Público">Público (PVP)</option>
                        <option value="Distribuidor">Distribuidor (Mayorista)</option>
                        <option value="Farmacia">Chain / Farmacia</option>
                        <option value="Salon">Salón / Profesional</option>
                        <option value="VIP">Cliente VIP / Exclusivo</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>% Descuento Fijo (Automatic)</label>
                      <input
                        type="number"
                        value={formData.default_discount}
                        onChange={e => setFormData({ ...formData, default_discount: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Días de Visita (Vendedor)</label>
                      <input
                        value={formData.visit_days}
                        onChange={e => setFormData({ ...formData, visit_days: e.target.value })}
                        placeholder="Ej: Lun, Jue"
                      />
                    </div>
                    <div className="form-group">
                      <label>Ubicación GPS (Lat, Long)</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="number"
                          placeholder="Latitud"
                          value={formData.latitude}
                          onChange={e => setFormData({ ...formData, latitude: parseFloat(e.target.value) || '' as any })}
                        />
                        <input
                          type="number"
                          placeholder="Longitud"
                          value={formData.longitude}
                          onChange={e => setFormData({ ...formData, longitude: parseFloat(e.target.value) || '' as any })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notas Especiales / Instrucciones</label>
                    <textarea
                      value={formData.special_notes}
                      onChange={e => setFormData({ ...formData, special_notes: e.target.value })}
                      placeholder="Ej: Entrar por la puerta trasera, solo recibe pagos en efectivo..."
                      style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, minHeight: 80 }}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn-confirm" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Guardando...' : 'Registrar Cliente'}
                </button>
              </div>
            </div>
          </div>
        )}

        {profileData && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setProfileData(null)}>
            <div className="modal-panel" style={{ maxWidth: 900 }}>
              <div className="modal-header"><div><h2><Users size={20} /> {profileData.business_name || profileData.name}</h2><span>{profileData.code} · {profileData.identification_type} {profileData.identification_number}</span></div><button className="modal-close" onClick={() => setProfileData(null)}><X size={20} /></button></div>
              <div className="modal-body">
                <div className="stats-grid">
                  <div className="stat-card"><div className="stat-info"><span className="stat-label">Saldo registrado</span><span className="stat-value">{fmt(Number(profileData.balance) || 0)}</span></div></div>
                  <div className="stat-card"><div className="stat-info"><span className="stat-label">Vencido estimado*</span><span className="stat-value">{fmt(Number(profileData.overdue_balance) || 0)}</span></div></div>
                  <div className="stat-card"><div className="stat-info"><span className="stat-label">Cupo disponible estimado</span><span className="stat-value">{fmt(Math.max(0, Number(profileData.credit_limit || 0) - Number(profileData.balance || 0)))}</span></div></div>
                </div>
                <div className="section-title"><User size={16} /> Contactos <button className="btn-secondary" onClick={() => { setEditingRelationship(null); setRelationshipType('contact'); setRelationshipForm({ contact_type: 'general', is_primary: false }); }}>Agregar contacto</button></div>
                {relationshipType === 'contact' && <div className="relationship-form"><input placeholder="Nombre completo" value={relationshipForm.full_name || ''} onChange={e => setRelationshipForm({ ...relationshipForm, full_name: e.target.value })} /><input placeholder="Área o cargo" value={relationshipForm.department || ''} onChange={e => setRelationshipForm({ ...relationshipForm, department: e.target.value })} /><input placeholder="Correo" value={relationshipForm.email || ''} onChange={e => setRelationshipForm({ ...relationshipForm, email: e.target.value })} /><input placeholder="Teléfono" value={relationshipForm.phone || ''} onChange={e => setRelationshipForm({ ...relationshipForm, phone: e.target.value })} /><label><input type="checkbox" checked={relationshipForm.is_primary || false} onChange={e => setRelationshipForm({ ...relationshipForm, is_primary: e.target.checked })} /> Contacto principal</label><button className="btn-confirm" onClick={() => void submitRelationship()}>Guardar contacto</button></div>}
                {(profileData.contacts || []).length ? profileData.contacts.map((c: any) => <div className="profile-line" key={c.id}><strong>{c.full_name}</strong><span>{c.contact_type} · {c.department || '—'}</span><span>{c.email || '—'} · {c.phone || '—'} <button className="btn-icon edit" title="Editar contacto" onClick={() => { setRelationshipType('contact'); setEditingRelationship(c.id); setRelationshipForm({ ...c }); }}><Edit size={14} /></button> <button className="btn-icon delete" title="Desactivar contacto" onClick={() => void deactivateRelationship('contact', c.id)}>×</button></span></div>) : <p>Sin contactos adicionales registrados.</p>}
                <div className="section-title"><MapPin size={16} /> Direcciones <button className="btn-secondary" onClick={() => { setEditingRelationship(null); setRelationshipType('address'); setRelationshipForm({ address_type: 'delivery', country_code: 'EC', is_billing_default: false, is_delivery_default: false }); }}>Agregar dirección</button></div>
                {relationshipType === 'address' && <div className="relationship-form"><input placeholder="Etiqueta (entrega, oficina…)" value={relationshipForm.label || ''} onChange={e => setRelationshipForm({ ...relationshipForm, label: e.target.value })} /><input placeholder="Provincia" value={relationshipForm.province || ''} onChange={e => setRelationshipForm({ ...relationshipForm, province: e.target.value })} /><input placeholder="Cantón" value={relationshipForm.canton || ''} onChange={e => setRelationshipForm({ ...relationshipForm, canton: e.target.value, city: e.target.value })} /><input placeholder="Calle principal" value={relationshipForm.street || ''} onChange={e => setRelationshipForm({ ...relationshipForm, street: e.target.value })} /><input placeholder="Número" value={relationshipForm.street_number || ''} onChange={e => setRelationshipForm({ ...relationshipForm, street_number: e.target.value })} /><input placeholder="Referencia" value={relationshipForm.reference || ''} onChange={e => setRelationshipForm({ ...relationshipForm, reference: e.target.value })} /><select value={relationshipForm.address_type} onChange={e => setRelationshipForm({ ...relationshipForm, address_type: e.target.value })}><option value="delivery">Entrega</option><option value="billing">Facturación</option><option value="branch">Sucursal</option><option value="other">Otra</option></select><label><input type="checkbox" checked={relationshipForm.is_billing_default} onChange={e => setRelationshipForm({ ...relationshipForm, is_billing_default: e.target.checked })} /> Predeterminada para facturación</label><label><input type="checkbox" checked={relationshipForm.is_delivery_default} onChange={e => setRelationshipForm({ ...relationshipForm, is_delivery_default: e.target.checked })} /> Predeterminada para entrega</label><button className="btn-confirm" onClick={() => void submitRelationship()}>Guardar dirección</button></div>}
                {(profileData.addresses || []).length ? profileData.addresses.map((a: any) => <div className="profile-line" key={a.id}><strong>{a.label || a.address_type}</strong><span>{[a.street, a.street_number, a.intersection, a.city, a.province, a.country_code].filter(Boolean).join(', ')}</span><span>{a.is_billing_default ? 'Facturación predeterminada ' : ''}{a.is_delivery_default ? 'Entrega predeterminada' : ''} <button className="btn-icon edit" title="Editar dirección" onClick={() => { setRelationshipType('address'); setEditingRelationship(a.id); setRelationshipForm({ ...a }); }}><Edit size={14} /></button> <button className="btn-icon delete" title="Desactivar dirección" onClick={() => void deactivateRelationship('address', a.id)}>×</button></span></div>) : <p>Sin direcciones estructuradas registradas.</p>}
                <div className="section-title"><CreditCard size={16} /> Solicitudes de crédito</div>
                {(profileData.credit_requests || []).map((r: any) => <div className="profile-line" key={r.id}><strong>{fmt(Number(r.requested_limit))} · {r.requested_terms} días · {r.status}</strong><span>{r.reason}</span><span>{r.status === 'pending' && <><button className="btn-secondary" onClick={() => void reviewCredit(r.id, 'approved', customers.find(c => c.id === profileData.id) || profileData)}>Aprobar</button> <button className="btn-secondary" onClick={() => void reviewCredit(r.id, 'rejected', customers.find(c => c.id === profileData.id) || profileData)}>Rechazar</button></>}</span></div>)}
                <div className="section-title"><CreditCard size={16} /> Historial de crédito</div>
                {(profileData.credit_history || []).length ? profileData.credit_history.map((h: any) => <div className="profile-line" key={h.id}><strong>{fmt(Number(h.previous_limit))} → {fmt(Number(h.new_limit))}</strong><span>Plazo {h.previous_terms} → {h.new_terms} días · {new Date(h.created_at).toLocaleString()}</span><span>{h.reason}</span></div>) : <p>Aún no hay cambios de cupo registrados.</p>}
                <div className="section-title"><FileText size={16} /> Ventas recientes</div>
                {(profileData.sales || []).length ? profileData.sales.slice(0, 10).map((s: any) => <div className="profile-line" key={s.id}><strong>{s.sale_number} · {fmt(Number(s.total_amount))}</strong><span>{new Date(s.sale_date).toLocaleDateString()} · {s.status} · Pago: {s.payment_status}</span></div>) : <p>Este cliente todavía no tiene ventas.</p>}
                <div className="section-title"><Clock size={16} /> Actividad reciente</div>
                {(profileData.activity || []).slice(0, 12).map((a: any) => <div className="profile-line" key={a.id}><strong>{a.description}</strong><span>{a.event_type} · {new Date(a.created_at).toLocaleString()}</span></div>)}
                <small>*Saldo vencido aproximado basado en ventas y fecha de venta; no reemplaza antigüedad contable por vencimiento de factura.</small>
              </div>
              <div className="modal-footer"><button className="btn-secondary" onClick={() => setProfileData(null)}>Cerrar ficha</button></div>
            </div>
          </div>
        )}

        {creditCustomer && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCreditCustomer(null)}>
            <div className="modal-panel" style={{ maxWidth: 560 }}>
              <div className="modal-header"><h2><CreditCard size={20} /> Solicitar condiciones de crédito</h2><button className="modal-close" onClick={() => setCreditCustomer(null)}><X size={20} /></button></div>
              <div className="modal-body"><p>{creditCustomer.business_name || creditCustomer.name} · {creditCustomer.code}</p>
                <div className="form-row"><div className="form-group"><label>Cupo aprobado USD</label><input type="number" min="0" value={creditForm.credit_limit} onChange={e => setCreditForm({ ...creditForm, credit_limit: Number(e.target.value) })} /></div><div className="form-group"><label>Plazo en días</label><input type="number" min="0" max="365" value={creditForm.payment_terms} onChange={e => setCreditForm({ ...creditForm, payment_terms: Number(e.target.value) })} /></div></div>
                <div className="form-group"><label>Motivo del cambio (obligatorio)</label><textarea value={creditForm.reason} onChange={e => setCreditForm({ ...creditForm, reason: e.target.value })} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, minHeight: 90 }} /></div>
                <p>La solicitud no modifica el cupo vigente. Otra persona con permiso de aprobación debe aprobarla para aplicar el cambio.</p>
              </div><div className="modal-footer"><button className="btn-secondary" onClick={() => setCreditCustomer(null)}>Cancelar</button><button className="btn-confirm" onClick={() => void submitCredit()}>Enviar solicitud</button></div>
            </div>
          </div>
        )}

        {statementCustomer && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setStatementCustomer(null)}>
            <div className="modal-panel" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h2><FileText size={20} /> Estado de Cuenta: {statementCustomer.name}</h2>
                <button className="modal-close" onClick={() => setStatementCustomer(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                {loadingStatement ? (
                  <div className="loading-state"><RefreshCw size={24} className="spin" /></div>
                ) : statementData.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle size={48} style={{ color: '#059669' }} />
                    <h3>Cuenta al día</h3>
                    <p>Este cliente no tiene facturas pendientes.</p>
                  </div>
                ) : (
                  <div className="statement-list">
                    <div className="statement-summary">
                      <div className="summary-item">
                        <span className="label">Total Pendiente</span>
                        <span className="value debt">{fmt(statementData.reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount)), 0))}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Facturas Pendientes</span>
                        <span className="value">{statementData.length}</span>
                      </div>
                    </div>
                    <table className="data-table small">
                      <thead>
                        <tr>
                          <th>Factura</th>
                          <th>Fecha</th>
                          <th>Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementData.map(item => (
                          <tr key={item.id}>
                            <td><strong>{item.sale_number}</strong></td>
                            <td>{new Date(item.sale_date).toLocaleDateString()}</td>
                            <td className="debt">{fmt(Number(item.total_amount) - Number(item.paid_amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setStatementCustomer(null)}>Cerrar</button>
                <button className="btn-confirm whatsapp" onClick={shareStatementWhatsApp} disabled={statementData.length === 0}>
                  <MessageSquare size={16} /> Compartir por WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .customers-page { padding: 32px; max-width: 1400px; margin: 0 auto; color: var(--foreground); }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
        .header-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 10px; }
        .header-actions > button, .header-actions > label { min-height: 44px; justify-content: center; white-space: nowrap; }
        .page-header h1 { font-size: 1.8rem; font-weight: 800; margin: 0; color: var(--foreground); }
        .page-subtitle { color: var(--muted-foreground); font-size: 0.95rem; margin-top: 4px; }

        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
        .stat-card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .stat-label { font-size: 0.8rem; font-weight: 600; color: var(--muted-foreground); display: block; }
        .stat-value { font-size: 1.5rem; font-weight: 800; color: var(--foreground); }

        .filters-bar { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; align-items: center; }
        .filters-bar { flex-wrap: wrap; }
        .search-box { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 0 14px; height: 42px; }
        .search-box input { border: none; outline: none; width: 100%; font-size: 0.9rem; background: transparent; color: var(--foreground); }
        .filter-group { display: flex; gap: 10px; }
        .filter-group select { padding: 0 12px; height: 42px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.85rem; outline: none; background: var(--card); }

        .table-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .empty-state { min-height: 250px; box-sizing: border-box; padding: 40px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--foreground); }
        .empty-state > svg { box-sizing: content-box; width: 28px; height: 28px; padding: 14px; border-radius: 16px; background: var(--secondary); color: #064035; }
        .empty-state h3 { margin: 16px 0 5px; color: var(--foreground); font-size: 1.1rem; font-weight: 750; }
        .empty-state p { margin: 0; max-width: 360px; color: var(--muted-foreground); font-size: .9rem; line-height: 1.5; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th { background: var(--background); padding: 12px 16px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--muted-foreground); border-bottom: 1px solid var(--border); }
        .table-row td { padding: 16px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        .table-row:hover td { background: var(--background); }
        .pagination-bar { display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 4px;color:var(--muted-foreground);font-size:.85rem; }
        .pagination-bar>div { display:flex;gap:8px; }
        .profile-line { display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1fr) minmax(200px,1.5fr);gap:12px;padding:12px 4px;border-bottom:1px solid var(--border);font-size:.88rem; }
        .relationship-form { display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:14px;margin:12px 0;background:var(--background);border:1px solid var(--border);border-radius:12px; }
        .relationship-form input:not([type=checkbox]),.relationship-form select { min-width:0;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--foreground); }
        .section-title button { margin-left:auto;text-transform:none; }

        .sub-text { font-size: 0.75rem; color: #94a3b8; display: block; }
        .location-info { display: flex; align-items: center; gap: 4px; color: var(--muted-foreground); font-size: 0.8rem; }
        .type-badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .type-badge.mayorista { background: #e0f2fe; color: #0369a1; }
        .type-badge.minorista { background: var(--secondary); color: var(--muted-foreground); }
        .type-badge.farmacia { background: #f0fdf4; color: #166534; }
        .credit-info .amount { font-weight: 700; color: #064035; display: block; }
        .credit-info .terms { font-size: 0.75rem; color: var(--muted-foreground); }

        .price-level-cell { display: flex; flex-direction: column; gap: 4px; }
        .price-badge { padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; border: 1px solid transparent; width: fit-content; }
        .price-badge.distribuidor { background: #faf5ff; color: #7e22ce; border-color: #e9d5ff; }
        .price-badge.farmacia { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
        .price-badge.salon { background: #fff1f2; color: #e11d48; border-color: #fecdd3; }
        .price-badge.público { background: var(--background); color: var(--muted-foreground); border-color: var(--border); }
        .price-badge.vip { background: #fffbeb; color: #b45309; border-color: #fde68a; }

        .discount-tag { font-size: 0.7rem; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 1px 5px; border-radius: 4px; width: fit-content; }
        .visit-days-tag { font-size: 0.7rem; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block; }
        
        .maps-link { color: #2563eb; transition: transform 0.2s; display: flex; align-items: center; justify-content: center; background: #eff6ff; width: 20px; height: 20px; border-radius: 50%; }
        .maps-link:hover { transform: scale(1.2); color: #1d4ed8; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); border-radius: 16px; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--background); }
        .modal-body { padding: 24px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 12px; background: var(--background); }

        .section-title { font-size: 0.85rem; font-weight: 800; color: var(--foreground); margin: 24px 0 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .section-title:first-child { margin-top: 0; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 0.75rem; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; }
        .form-group input, .form-group select { padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; outline: none; background: #fcfcfc; }
        .form-group input:focus { border-color: #064035; background: var(--card); box-shadow: 0 0 0 2px rgba(6, 64, 53, 0.05); }

        .btn-primary { background: #064035; color: white; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .import-button { display:flex;align-items:center;gap:8px;cursor:pointer; } .import-button input { display:none; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-confirm { background: #064035; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        .btn-secondary { background: var(--card); border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; }

        .row-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .btn-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--muted-foreground); cursor: pointer; transition: all 0.2s; }
        .btn-icon:hover { background: var(--background); color: var(--foreground); border-color: var(--border); }
        .btn-icon.edit:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
        .btn-icon.delete:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
        .btn-icon.statement:hover { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }

        .loyalty-tag { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; }
        .loyalty-tag.inactive { background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; }
        .loyalty-tag.critical { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }

        .balance-debt { font-size: 0.75rem; color: #dc2626; font-weight: 600; }
        
        /* Insights Styles */
        .insights-container {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-bottom: 24px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .insights-header {
          padding: 16px 20px;
          background: var(--background);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
        }

        .header-left { display: flex; align-items: center; gap: 12px; color: var(--foreground); }
        .header-left h2 { font-size: 1rem; font-weight: 800; margin: 0; }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--secondary);
        }

        .insight-card {
          background: var(--card);
          padding: 20px;
        }

        .insight-card h3 {
          font-size: 0.8rem;
          font-weight: 800;
          color: var(--muted-foreground);
          text-transform: uppercase;
          margin-bottom: 16px;
        }

        .mini-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .mini-table th {
          text-align: left;
          font-size: 0.7rem;
          color: #94a3b8;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }

        .mini-table td {
          padding: 10px 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--foreground);
          border-bottom: 1px solid var(--muted);
        }

        .debt-val { color: #dc2626; text-align: right; }
        .spent-val { color: #059669; text-align: right; }
        .last-seen-tag {
          font-size: 0.75rem;
          background: #fff7ed;
          color: #c2410c;
          padding: 2px 6px;
          border-radius: 4px;
        }

        @media (max-width: 1024px) {
          .insights-grid { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 700px) { .customers-page { padding:16px; } .page-header { flex-direction: column; align-items: stretch; gap: 16px; } .header-actions { justify-content: flex-start; } .filters-bar { align-items:stretch; } .filter-group { flex-wrap:wrap; } .filter-group select { flex:1;min-width:140px; } .profile-line { grid-template-columns:1fr;gap:4px; } .pagination-bar { align-items:flex-start;flex-direction:column; } }
        @media (max-width: 420px) { .header-actions > button, .header-actions > label { flex: 1 1 calc(50% - 8px); padding-left: 12px; padding-right: 12px; } .header-actions > .btn-primary { flex-basis: 100%; } .empty-state { min-height: 220px; padding: 32px 18px; } }
        .balance-ok { font-size: 0.75rem; color: #059669; font-weight: 600; }

        .statement-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: var(--background); padding: 16px; border-radius: 12px; }
        .summary-item { display: flex; flex-direction: column; gap: 4px; }
        .summary-item .label { font-size: 0.75rem; color: var(--muted-foreground); font-weight: 600; }
        .summary-item .value { font-size: 1.25rem; font-weight: 800; color: var(--foreground); }
        .summary-item .value.debt { color: #dc2626; }

        .btn-confirm.whatsapp { background: #25d366; display: flex; align-items: center; gap: 8px; }
        .btn-confirm.whatsapp:hover { background: #128c7e; }
        .btn-confirm.whatsapp:disabled { background: var(--border); color: #94a3b8; cursor: not-allowed; }

        .data-table.small th, .data-table.small td { padding: 8px 12px; font-size: 0.85rem; }
        .debt { color: #dc2626; font-weight: 600; }

        .toast { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; color: white; z-index: 3000; display: flex; align-items: center; gap: 10px; animation: slideIn 0.3s; box-shadow: 0 10px 15px rgba(0,0,0,0.1); }
        .toast.ok { background: #059669; }
        .toast.err { background: #dc2626; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
