'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../../components/Navbar';
import {
  ShoppingBag, Plus, X, Search, ChevronRight,
  TrendingUp, CreditCard,
  Banknote, Smartphone, RefreshCw, AlertCircle, CheckCircle,
  FileText, Undo, Printer, User, Monitor
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Sale {
  id: string;
  sale_number: string;
  customer_name: string;
  sale_date: string;
  status: string;
  payment_status: string;
  total_amount: number;
  subtotal: number;
  items_count: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  available_batches?: { batch_id: string; quantity: number; unit_price?: number }[];
}

interface Customer { id: string; name: string; phone?: string; }

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
}

interface PaymentEntry {
  method: string;
  amount: string;
  reference: string;
}

interface Summary { today: any; week: any; month: any; top_products: any[]; }

const API = 'http://localhost:3000/api';

const paymentMethods = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: TrendingUp },
  { value: 'mobile_payment', label: 'Pago móvil', icon: Smartphone },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: '#dcfce7', color: '#166534', label: 'Completada' },
    cancelled: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelada' },
    draft: { bg: '#fef9c3', color: '#713f12', label: 'Borrador' },
    refunded: { bg: '#e0e7ff', color: '#3730a3', label: 'Devuelta' },
    authorized: { bg: '#dcfce7', color: '#166534', label: 'Autorizada' },
    pending: { bg: '#fef9c3', color: '#713f12', label: 'Pendiente' },
  };
  const s = map[status] ?? { bg: '#f3f4f6', color: '#374151', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
      {s.label}
    </span>
  );
};

const PayBadge = ({ status }: { status: string }) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid: { bg: '#dcfce7', color: '#166534', label: 'Pagado' },
    pending: { bg: '#fefce8', color: '#854d0e', label: 'Pendiente' },
    partial: { bg: '#ffedd5', color: '#9a3412', label: 'Parcial' },
  };
  const s = map[status] ?? { bg: '#f3f4f6', color: '#374151', label: status };
  return (
    <span style={{ border: `1px solid ${s.color}40`, color: s.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'white' }}>
      {s.label}
    </span>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'quotes' | 'returns'>('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showInsights, setShowInsights] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // ─ Modal State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedCashier, setSelectedCashier] = useState('');
  const [posTerminal, setPosTerminal] = useState('CAJA-01');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: '', reference: '' }]);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const [salesRes, summaryRes, quotesRes, returnsRes, analyticsRes] = await Promise.all([
        fetch(`${API}/sales`, { headers }),
        fetch(`${API}/sales/summary`, { headers }),
        fetch(`${API}/sales/quotes`, { headers }),
        fetch(`${API}/sales/returns`, { headers }),
        fetch(`${API}/reports/dashboard`, { headers }),
      ]);
      if (salesRes.ok) setSales(await salesRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (quotesRes.ok) setQuotes(await quotesRes.json());
      if (returnsRes.ok) setReturns(await returnsRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch {
      showToast('Error cargando datos', 'err');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openModal = async () => {
    setShowModal(true);
    setCart([]); setSelectedCustomer(''); setPayments([{ method: 'cash', amount: '', reference: '' }]);
    setGlobalDiscount(0); setNotes('');
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const [cr, pr, ur] = await Promise.all([
        fetch(`${API}/customers`, { headers }),
        fetch(`${API}/products`, { headers }),
        fetch(`${API}/users`, { headers }),
      ]);
      setCustomers(await cr.json());
      setProducts(await pr.json());
      setUsers(await ur.json());
    } catch { showToast('Error cargando catálogos', 'err'); }
  };

  const addToCart = (p: Product) => {
    if (cart.find(c => c.product_id === p.id)) return;
    setCart(prev => [...prev, { product_id: p.id, product_name: p.name, quantity: 1, unit_price: 0, discount: 0 }]);
    setProductSearch('');
  };

  const updateCart = (idx: number, field: keyof CartItem, value: any) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeFromCart = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const subtotal = cart.reduce((s, c) => s + c.quantity * c.unit_price * (1 - c.discount / 100), 0);
  const discountAmt = subtotal * (globalDiscount / 100);
  const totalAmount = subtotal - discountAmt;
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!selectedCustomer) return showToast('Selecciona un cliente', 'err');
    if (cart.length === 0) return showToast('Agrega al menos un producto', 'err');
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          customer_id: selectedCustomer,
          sale_date: saleDate,
          discount: globalDiscount,
          notes,
          pos_terminal: posTerminal,
          cashier_id: selectedCashier || null,
          items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity, unit_price: c.unit_price, discount: c.discount })),
          payments: payments.filter(p => parseFloat(p.amount) > 0).map(p => ({ method: p.method, amount: parseFloat(p.amount), reference: p.reference || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al crear venta');
      showToast(`✅ ${data.message}`, 'ok');
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
    setSubmitting(false);
  };

  const filtered = sales.filter(s => {
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const matchSearch = !searchTerm || s.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.sale_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const filteredProducts = products.filter(p =>
    productSearch.length > 1 && (p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase()))
  );

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />
      <div className="sales-page">
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === 'ok' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{toast.msg}</span>
          </div>
        )}

        <div className="page-header">
          <div>
            <h1>Espacio de Ventas</h1>
            <p className="page-subtitle">Gestiona transacciones, cotizaciones y devoluciones</p>
          </div>
          <div className="header-actions">
            <button className="btn-primary" onClick={openModal}>
              <Plus size={18} /> Nueva Venta
            </button>
          </div>
        </div>

        {/* ─── Commercial Insights Section ─── */}
        {analytics && (
          <div className="insights-container">
            <div className="insights-header" onClick={() => setShowInsights(!showInsights)}>
              <div className="header-left">
                <TrendingUp size={20} />
                <h2>Insights Comerciales y Cartera</h2>
              </div>
              <ChevronRight size={20} style={{ transform: showInsights ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
            </div>

            {showInsights && (
              <div className="insights-grid">
                {/* Top Sellers */}
                <div className="insight-card">
                  <h3>🏆 Top Vendedores</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Asesor</th><th>Total</th></tr></thead>
                      <tbody>
                        {analytics.topSellers.map((s: any, i: number) => (
                          <tr key={i}>
                            <td>{s.full_name || s.username}</td>
                            <td className="value-text">${parseFloat(s.total_sold || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Products */}
                <div className="insight-card">
                  <h3>⭐ Productos Top</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Producto</th><th>Vendidos</th></tr></thead>
                      <tbody>
                        {analytics.topProducts.map((p: any, i: number) => (
                          <tr key={i}>
                            <td>{p.name}</td>
                            <td className="count-text">{p.total_qty} unds</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Accounts Receivable */}
                <div className="insight-card">
                  <h3>💸 Cuentas por Cobrar</h3>
                  <div className="mini-table">
                    <table>
                      <thead><tr><th>Cliente</th><th>Saldo</th></tr></thead>
                      <tbody>
                        {analytics.debtors.length === 0 && (
                          <tr><td colSpan={2} className="empty-cell">Sin deudas pendientes.</td></tr>
                        )}
                        {analytics.debtors.map((d: any, i: number) => (
                          <tr key={i}>
                            <td>{d.name}</td>
                            <td className="debt-text">${parseFloat(d.total_debt).toLocaleString()}</td>
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

        <div className="tabs-container">
          <button className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}>
            <ShoppingBag size={18} /> Ventas
          </button>
          <button className={`tab-btn ${activeTab === 'quotes' ? 'active' : ''}`} onClick={() => setActiveTab('quotes')}>
            <FileText size={18} /> Cotizaciones
          </button>
          <button className={`tab-btn ${activeTab === 'returns' ? 'active' : ''}`} onClick={() => setActiveTab('returns')}>
            <Undo size={18} /> Devoluciones
          </button>
        </div>

        {activeTab === 'sales' && (
          <>
            <div className="filters-bar">
              <div className="search-box">
                <Search size={16} />
                <input placeholder="Buscar por cliente o número..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="filter-tabs">
                {['all', 'completed', 'cancelled', 'draft'].map(s => (
                  <button key={s} className={`filter-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                    {s === 'all' ? 'Todas' : s === 'completed' ? 'Completadas' : s === 'cancelled' ? 'Canceladas' : 'Borradores'}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-card">
              {loading ? (
                <div className="loading-state"><RefreshCw size={24} className="spin" /><span>Cargando...</span></div>
              ) : filtered.length === 0 ? (
                <div className="empty-state"><ShoppingBag size={48} /><h3>Sin ventas</h3><p>Crea tu primera venta con el botón "Nueva Venta"</p></div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Número</th><th>Cliente</th><th>Fecha</th><th>Items</th>
                      <th>Total</th><th>Estado</th><th>Pago</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(sale => (
                      <tr key={sale.id} className="table-row">
                        <td><span className="sale-num">{sale.sale_number}</span></td>
                        <td><strong>{sale.customer_name || 'Consumidor Final'}</strong></td>
                        <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                        <td><span className="items-count">{sale.items_count}</span></td>
                        <td><strong className="amount">{fmt(sale.total_amount)}</strong></td>
                        <td><StatusBadge status={sale.status} /></td>
                        <td><PayBadge status={sale.payment_status} /></td>
                        <td>
                          <div className="row-actions">
                            <a href={`/sales/${sale.id}`} className="btn-detail"> Ver <ChevronRight size={14} /></a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'quotes' && (
          <div className="table-card">
            {loading ? (
              <div className="loading-state"><RefreshCw size={24} className="spin" /><span>Cargando...</span></div>
            ) : quotes.length === 0 ? (
              <div className="empty-state"><FileText size={48} /><h3>Sin cotizaciones</h3><p>Genera nuevas cotizaciones para tus clientes</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Referencia</th><th>Cliente</th><th>Vence</th><th>Total</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.id} className="table-row">
                      <td><span className="sale-num">{q.quote_number}</span></td>
                      <td><strong>{q.customer_name}</strong></td>
                      <td>{new Date(q.valid_until).toLocaleDateString()}</td>
                      <td><strong className="amount">{fmt(q.total_amount)}</strong></td>
                      <td><StatusBadge status={q.status} /></td>
                      <td><button className="btn-detail">Convertir a Venta</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'returns' && (
          <div className="table-card">
            {loading ? (
              <div className="loading-state"><RefreshCw size={24} className="spin" /><span>Cargando...</span></div>
            ) : returns.length === 0 ? (
              <div className="empty-state"><Undo size={48} /><h3>Sin devoluciones</h3><p>Las devoluciones se gestionan desde el detalle de la venta</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Venta</th><th>Cliente</th><th>Motivo</th><th>Reembolso</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {returns.map(r => (
                    <tr key={r.id} className="table-row">
                      <td><span className="sale-num">{r.sale_number}</span></td>
                      <td><strong>{r.customer_name}</strong></td>
                      <td>{r.reason}</td>
                      <td><strong className="amount">{fmt(r.refund_amount)}</strong></td>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal-panel">
              <div className="modal-header">
                <h2><ShoppingBag size={20} /> Nueva Transacción</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="modal-left">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Cliente</label>
                      <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Fecha</label>
                      <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Cajero</label>
                      <div className="input-icon-wrap">
                        <User size={14} />
                        <select value={selectedCashier} onChange={e => setSelectedCashier(e.target.value)}>
                          <option value="">— Seleccionar —</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Terminal POS</label>
                      <div className="input-icon-wrap">
                        <Monitor size={14} />
                        <input value={posTerminal} onChange={e => setPosTerminal(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ position: 'relative' }}>
                    <label>Buscar Productos</label>
                    <div className="product-search-wrap">
                      <Search size={16} />
                      <input placeholder="Nombre o SKU..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    </div>
                    {filteredProducts.length > 0 && (
                      <div className="product-dropdown">
                        {filteredProducts.map(p => (
                          <button key={p.id} className="product-option" onClick={() => addToCart(p)}>
                            <span className="prod-name">{p.name}</span>
                            <span className="prod-sku">{p.sku}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="cart-section">
                    <div className="cart-header-row">
                      <span>Producto</span><span>Cant.</span><span>Precio</span><span>Total</span><span></span>
                    </div>
                    {cart.map((item, idx) => (
                      <div key={idx} className="cart-row">
                        <span className="cart-prod-name">{item.product_name}</span>
                        <input type="text" value={item.quantity} onChange={e => updateCart(idx, 'quantity', parseInt(e.target.value) || 1)} className="cart-input" />
                        <input type="text" value={item.unit_price} onChange={e => updateCart(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="cart-input" />
                        <span className="cart-line-total">{fmt(item.quantity * item.unit_price * (1 - item.discount / 100))}</span>
                        <button className="cart-remove" onClick={() => removeFromCart(idx)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="modal-right">
                  <div className="summary-card">
                    <h3>Resumen</h3>
                    <div className="summary-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                    <div className="summary-row">
                      <span>Descuento</span>
                      <div className="discount-input-wrap">
                        <input type="text" value={globalDiscount} onChange={e => setGlobalDiscount(parseFloat(e.target.value) || 0)} className="discount-input" />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="summary-divider" />
                    <div className="summary-row total-row"><strong>TOTAL</strong><strong className="total-amount">{fmt(totalAmount)}</strong></div>
                  </div>

                  <div className="payments-card">
                    <h3>Pago</h3>
                    {payments.map((pay, idx) => (
                      <div key={idx} className="payment-row">
                        <select value={pay.method} onChange={e => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, method: e.target.value } : p))}>
                          {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <input type="text" placeholder="Monto" value={pay.amount} onChange={e => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, amount: e.target.value } : p))} />
                      </div>
                    ))}
                    <div className={`pay-diff ${totalPaid >= totalAmount ? 'paid' : totalPaid > 0 ? 'partial' : 'pending'}`}>
                      {totalPaid >= totalAmount ? '✅ PAGADO' : `⚠️ FALTA: ${fmt(totalAmount - totalPaid)}`}
                    </div>
                  </div>

                  <button className="btn-confirm" onClick={handleSubmit} disabled={submitting || cart.length === 0}>
                    {submitting ? 'Procesando...' : 'Confirmar Venta'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .sales-page { padding: 32px; max-width: 1400px; margin: 0 auto; color: var(--foreground); }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .page-header h1 { font-size: 1.8rem; font-weight: 800; margin: 0; color: var(--foreground); }
        .page-subtitle { color: var(--muted-foreground); font-size: 0.95rem; margin-top: 4px; }
        
        .tabs-container { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
        .tab-btn { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border: none; background: none; 
          font-weight: 600; color: var(--muted-foreground); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .tab-btn:hover { color: var(--foreground); background: var(--background); }
        .tab-btn.active { color: #064035; border-bottom-color: #064035; }

        .filters-bar { display: flex; gap: 16px; margin-bottom: 20px; align-items: center; }
        .search-box { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 0 14px; height: 42px; }
        .search-box input { border: none; outline: none; width: 100%; font-size: 0.9rem; background: transparent; color: var(--foreground); }
        
        .filter-tabs { display: flex; gap: 4px; }
        .filter-tab { padding: 6px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; background: var(--card); border: 1px solid var(--border); color: var(--muted-foreground); cursor: pointer; }
        .filter-tab.active { background: #064035; color: white; border-color: #064035; }

        .table-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th { background: var(--background); padding: 12px 16px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--muted-foreground); border-bottom: 1px solid var(--border); }
        .table-row td { padding: 16px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        .table-row:hover td { background: var(--background); }
        .sale-num { font-family: monospace; font-weight: 700; color: #3182ce; }
        .amount { color: #064035; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); border-radius: 16px; width: 100%; max-width: 1000px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--background); }
        .modal-body { display: grid; grid-template-columns: 1fr 320px; flex: 1; overflow: hidden; }
        .modal-left { padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; border-right: 1px solid var(--border); }
        .modal-right { padding: 24px; background: var(--background); display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 0.75rem; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; }
        .form-group input, .form-group select { padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; outline: none; }
        .form-group input:focus { border-color: #064035; }

        .input-icon-wrap { position: relative; display: flex; align-items: center; }
        .input-icon-wrap :global(svg) { position: absolute; left: 10px; color: #94a3b8; }
        .input-icon-wrap input, .input-icon-wrap select { padding-left: 32px !important; width: 100%; }

        .product-search-wrap { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); padding: 0 12px; border-radius: 8px; height: 42px; }
        .product-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: var(--card); border: 1px solid var(--border); border-radius: 8px; z-index: 10; box-shadow: 0 10px 15px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; }
        .product-option { width: 100%; padding: 10px; border: none; background: none; text-align: left; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; }
        .product-option:hover { background: var(--background); }

        .cart-section { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .cart-header-row { display: grid; grid-template-columns: 2fr 60px 80px 80px 32px; gap: 10px; padding: 10px; background: var(--background); font-size: 0.7rem; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; }
        .cart-row { display: grid; grid-template-columns: 2fr 60px 80px 80px 32px; gap: 10px; padding: 10px; border-bottom: 1px solid var(--border); align-items: center; }
        .cart-input { width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; text-align: center; font-size: 0.85rem; }
        .cart-prod-name { font-size: 0.85rem; font-weight: 600; }
        .cart-line-total { font-weight: 700; text-align: right; font-size: 0.85rem; }

        .summary-card, .payments-card { background: var(--card); padding: 16px; border-radius: 12px; border: 1px solid var(--border); }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; }
        .total-amount { font-size: 1.4rem; color: #064035; font-weight: 800; }
        
        .payment-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .pay-diff { margin-top: 10px; padding: 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; text-align: center; }
        .pay-diff.paid { background: #dcfce7; color: #166534; }
        .pay-diff.pending { background: #fefce8; color: #854d0e; }

        .btn-primary { background: #064035; color: white; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-confirm { background: #064035; color: white; border: none; padding: 14px; border-radius: 10px; font-weight: 700; width: 100%; cursor: pointer; }
        .btn-confirm:disabled { opacity: 0.5; }

        .toast { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; color: white; z-index: 3000; display: flex; align-items: center; gap: 10px; animation: slideIn 0.3s; }
        .toast.ok { background: #059669; }
        .toast.err { background: #dc2626; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Insights Section */
        .insights-container {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          margin-bottom: 24px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .insights-header {
          padding: 14px 20px;
          background: var(--background);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .header-left { display: flex; align-items: center; gap: 10px; color: var(--foreground); }
        .header-left h2 { font-size: 0.9rem; font-weight: 800; margin: 0; }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--secondary);
          border-top: 1px solid var(--secondary);
        }

        .insight-card { background: var(--card); padding: 20px; }
        .insight-card h3 { font-size: 0.75rem; font-weight: 800; color: var(--muted-foreground); text-transform: uppercase; margin-bottom: 16px; }
        .mini-table table { width: 100%; border-collapse: collapse; }
        .mini-table th { text-align: left; font-size: 0.65rem; color: #94a3b8; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        .mini-table td { padding: 10px 0; font-size: 0.85rem; font-weight: 600; color: var(--foreground); border-bottom: 1px solid var(--muted); }

        .value-text { color: #059669; text-align: right; }
        .debt-text { color: #ef4444; text-align: right; }
        .count-text { color: #3b82f6; text-align: right; }
        .empty-cell { color: #94a3b8; font-size: 0.8rem; text-align: center; padding: 20px 0; }

        @media (max-width: 1024px) {
          .insights-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
