'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Navbar from '../../components/Navbar';
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
  total_imports: number;
  total_purchased: number;
  created_at: string;
}

const API = 'http://localhost:3000/api';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // -- Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '', country: '', contact_person: '', email: '', phone: '',
    incoterm_default: 'FOB', shipping_port: '', estimated_lead_time: 45,
    payment_terms: '', brands_handled: '', website: ''
  });
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showInsights, setShowInsights] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [suppliersRes, analyticsRes] = await Promise.all([
        fetch(`${API}/suppliers`, { headers: { Authorization: `Bearer ${token}` } }),
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
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.brands_handled || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [suppliers, searchTerm]);

  const stats = useMemo(() => {
    const totalPurchased = suppliers.reduce((sum, s) => sum + Number(s.total_purchased), 0);
    const mostActiveCountry = suppliers.length > 0 
      ? Object.entries(suppliers.reduce((acc, s) => ({ ...acc, [s.country]: (acc[s.country] || 0) + 1 }), {} as any))
          .sort((a: any, b: any) => b[1] - a[1])[0][0]
      : 'N/A';
    return { totalPurchased, mostActiveCountry, count: suppliers.length };
  }, [suppliers]);

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name, country: supplier.country, contact_person: supplier.contact_person,
        email: supplier.email, phone: supplier.phone, incoterm_default: supplier.incoterm_default,
        shipping_port: supplier.shipping_port || '', estimated_lead_time: supplier.estimated_lead_time || 45,
        payment_terms: supplier.payment_terms || '', brands_handled: supplier.brands_handled || '',
        website: supplier.website || ''
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '', country: '', contact_person: '', email: '', phone: '',
        incoterm_default: 'FOB', shipping_port: '', estimated_lead_time: 45,
        payment_terms: '', brands_handled: '', website: ''
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
            <h1 className="title">Directorio de Proveedores y Fábricas</h1>
            <p className="subtitle">Gestión logística de sourcing internacional (China, USA, Colombia)</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-refresh" onClick={fetchData} disabled={loading}>
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
            </button>
            <button className="btn-create" onClick={() => handleOpenModal()}>
              <Plus size={18} /> Nuevo Proveedor
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><Globe size={20} /></div>
            <div className="stat-body">
              <span className="stat-label">Proveedores Activos</span>
              <span className="stat-value">{stats.count}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><DollarSign size={20} /></div>
            <div className="stat-body">
              <span className="stat-label">Inversión Total Acumulada</span>
              <span className="stat-value">${stats.totalPurchased.toLocaleString()}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}><Anchor size={20} /></div>
            <div className="stat-body">
              <span className="stat-label">Origen Principal</span>
              <span className="stat-value">{stats.mostActiveCountry}</span>
            </div>
          </div>
        </div>

        {/* ─── Sourcing Insights Section ─── */}
        {analytics && (
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
                  <h3>🌍 Principales Proveedores (Inversión)</h3>
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
                  <h3>⏱️ Tiempos de Entrega Reales (Promedio)</h3>
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
                  <h3>📦 Eficiencia de Pedidos</h3>
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
        <div className="filter-row">
          <div className="search-box">
            <Search size={18} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Buscar por fábrica, país o marca..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="loading-state">
             <RefreshCw size={40} className="spin" color="var(--border)" />
          </div>
        ) : (
          <div className="suppliers-grid">
            {filteredSuppliers.map(s => (
              <div key={s.id} className="supplier-card-premium">
                <div className="p-header">
                  <div className="p-brand-info">
                    <div className="p-flag-box">
                      {s.country === 'China' ? '🇨🇳' : s.country === 'USA' ? '🇺🇸' : s.country === 'Colombia' ? '🇨🇴' : '🌏'}
                    </div>
                    <div className="p-title-stack">
                      <h3 className="p-name">{s.name}</h3>
                      <span className="p-location">{s.country} • {s.shipping_port || 'No port set'}</span>
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
                      <span className="p-meta-label">Lead Time</span>
                      <span className="p-meta-value">{s.estimated_lead_time} días</span>
                    </div>
                  </div>

                  <div className="p-contact-section">
                    <div className="p-contact-item"><User size={14}/> <span>{s.contact_person}</span></div>
                    <div className="p-contact-item"><Mail size={14}/> <span>{s.email}</span></div>
                    <div className="p-contact-item"><Phone size={14}/> <span>{s.phone}</span></div>
                  </div>

                  {s.brands_handled && (
                    <div className="p-brands-tagline">
                      <ShieldCheck size={14}/> <span>{s.brands_handled}</span>
                    </div>
                  )}
                </div>

                <div className="p-stats-footer">
                  <div className="p-stat">
                    <span className="p-s-label">Cargas</span>
                    <span className="p-s-val">{s.total_imports}</span>
                  </div>
                  <div className="p-stat">
                    <span className="p-s-label">Inversión</span>
                    <span className="p-s-val">${Number(s.total_purchased).toLocaleString()}</span>
                  </div>
                  <a href={`https://wa.me/${s.phone.replace(/\D/g,'')}`} target="_blank" className="p-wa-action">
                    <MessageSquare size={16}/>
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
                <h2>{editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor Internacional'}</h2>
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
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        placeholder="Ej. Guangzhou Cosmetic Factory"
                      />
                    </div>
                    <div className="form-group">
                      <label>País</label>
                      <input 
                        required
                        value={formData.country} 
                        onChange={e => setFormData({...formData, country: e.target.value})} 
                        placeholder="Ej. China"
                      />
                    </div>
                    <div className="form-group">
                      <label>Persona de Contacto</label>
                      <input 
                        value={formData.contact_person} 
                        onChange={e => setFormData({...formData, contact_person: e.target.value})} 
                      />
                    </div>
                    <div className="form-group">
                      <label>WhatsApp / Teléfono (Incluir +)</label>
                      <input 
                        value={formData.phone} 
                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Correo Electrónico</label>
                      <input 
                        type="email"
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Sitio Web</label>
                      <input 
                        value={formData.website} 
                        onChange={e => setFormData({...formData, website: e.target.value})} 
                      />
                    </div>
                  </div>

                  <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--secondary)' }} />
                  
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Incoterm Preferido</label>
                      <select value={formData.incoterm_default} onChange={e => setFormData({...formData, incoterm_default: e.target.value})}>
                        <option value="FOB">FOB - Free On Board</option>
                        <option value="EXW">EXW - Ex Works</option>
                        <option value="CIF">CIF - Cost, Insurance, Freight</option>
                        <option value="CFR">CFR - Cost and Freight</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Puerto de Salida</label>
                      <input 
                        value={formData.shipping_port} 
                        onChange={e => setFormData({...formData, shipping_port: e.target.value})} 
                        placeholder="Ej. Ningbo"
                      />
                    </div>
                    <div className="form-group">
                      <label>Lead Time (Días)</label>
                      <input 
                        type="number"
                        value={formData.estimated_lead_time} 
                        onChange={e => setFormData({...formData, estimated_lead_time: parseInt(e.target.value)})} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Términos de Pago</label>
                      <input 
                        value={formData.payment_terms} 
                        onChange={e => setFormData({...formData, payment_terms: e.target.value})} 
                        placeholder="Ej. 30% Advance, 70% BL"
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Marcas que suministra</label>
                      <input 
                        value={formData.brands_handled} 
                        onChange={e => setFormData({...formData, brands_handled: e.target.value})} 
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

        @media (max-width: 1024px) {
          .insights-grid { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
          .p-meta-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
