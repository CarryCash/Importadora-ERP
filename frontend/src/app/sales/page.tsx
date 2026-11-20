'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';
import {
  ShoppingBag, Plus, X, Search, ChevronRight,
  TrendingUp, CreditCard,
  Banknote, Smartphone, RefreshCw, AlertCircle, CheckCircle,
  FileText, Undo, Printer, Monitor
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
  price?: number;
  sale_price?: number;
  iva_rate?: number;
  available_batches?: { batch_id: string; quantity: number; unit_price?: number }[];
}
interface ProductUnit {id:string;unit_code:string;name:string;is_base:boolean;precision_scale:number;dimension:string;conversion_factor?:number}

interface Customer { id: string; name: string; phone?: string; customer_type?: string; price_list_level?: string; }
interface PriceList { id:string; name:string; list_type:string; currency:string; max_discount_percent:number; rounding_rule?:string; }
interface PriceRule { product_id:string; min_quantity:number; unit_price:number; discount_percent:number; starts_at?:string|null; ends_at?:string|null; }

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  unit_id?:string;
  unit_code:string;
  conversion_factor:number;
  units:ProductUnit[];
}

interface PaymentEntry {
  method: string;
  amount: string;
  reference: string;
}

interface Summary { today: any; week: any; month: any; top_products: any[]; }

const API = '/api';
const localDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const paymentMethods = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: TrendingUp },
  { value: 'mobile_payment', label: 'Deuna / billetera', icon: Smartphone },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const { user } = useAuth();
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
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [priceLists, setPriceLists] = useState<PriceList[]>([]); const [selectedPriceList, setSelectedPriceList] = useState(''); const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [posTerminal, setPosTerminal] = useState('CAJA-01');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saleDate, setSaleDate] = useState(localDate);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: '', reference: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [showQuoteForm,setShowQuoteForm]=useState(false);const [quoteCustomers,setQuoteCustomers]=useState<Customer[]>([]);const [quoteProducts,setQuoteProducts]=useState<Product[]>([]);const [quotePriceLists,setQuotePriceLists]=useState<PriceList[]>([]);const [quoteCustomer,setQuoteCustomer]=useState('');const [quotePriceList,setQuotePriceList]=useState('');const [quoteDiscount,setQuoteDiscount]=useState('0');const [quoteValidUntil,setQuoteValidUntil]=useState('');const [quoteItems,setQuoteItems]=useState<{product_id:string;quantity:number;discount:number}[]>([{product_id:'',quantity:1,discount:0}]);

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const salePriceFromRule=(rule:PriceRule)=>{let amount=Number(rule.unit_price);const rounding=priceLists.find(list=>list.id===selectedPriceList)?.rounding_rule;if(rounding==='whole')amount=Math.round(amount);else if(rounding==='five_cents')amount=Math.round(amount*20)/20;else amount=Math.round((amount+Number.EPSILON)*100)/100;return amount*(1-Number(rule.discount_percent||0)/100);};
  const ruleIsCurrent=(rule:PriceRule)=>{const today=localDate();return (!rule.starts_at||String(rule.starts_at).slice(0,10)<=today)&&(!rule.ends_at||String(rule.ends_at).slice(0,10)>=today);};

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
      const [cr, pr, lr] = await Promise.all([
        fetch(`${API}/customers`, { headers }),
        fetch(`${API}/products`, { headers }),
        fetch(`${API}/product-pricing/available`, { headers }),
      ]);
      const customerData=await cr.json();setCustomers(Array.isArray(customerData)?customerData:customerData.items||[]);
      setProducts(await pr.json());
      setPriceLists(lr.ok?await lr.json():[]);setSelectedPriceList('');setPriceRules([]);
    } catch { showToast('Error cargando catálogos', 'err'); }
  };

  const changeSaleCustomer = async (customerId:string) => {
    setSelectedCustomer(customerId);setSelectedPriceList('');setPriceRules([]);
    try{const headers={Authorization:`Bearer ${localStorage.getItem('token')}`};const response=await fetch(`${API}/product-pricing/available${customerId?`?customer_id=${encodeURIComponent(customerId)}`:''}`,{headers});setPriceLists(response.ok?await response.json():[]);}catch{setPriceLists([]);}
  };

  useEffect(()=>{if(!selectedPriceList){setPriceRules([]);return;}let cancelled=false;fetch(`${API}/product-pricing/lists/${selectedPriceList}/rules`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.ok?r.json():[]).then(rows=>{if(!cancelled)setPriceRules(rows);}).catch(()=>{if(!cancelled)setPriceRules([]);});return()=>{cancelled=true;};},[selectedPriceList]);
  useEffect(()=>{setCart(current=>current.map(item=>{const match=selectedPriceList?priceRules.filter(rule=>rule.product_id===item.product_id&&Number(rule.min_quantity)<=item.quantity&&ruleIsCurrent(rule)).sort((a,b)=>Number(b.min_quantity)-Number(a.min_quantity))[0]:undefined;const product=products.find(p=>p.id===item.product_id);return {...item,unit_price:(match?salePriceFromRule(match):Number(product?.sale_price||product?.price||0))*item.conversion_factor};}));},[selectedPriceList,priceRules]);

  const addToCart = async (p: Product) => {
    if (cart.find(c => c.product_id === p.id)) return;
    let units:ProductUnit[]=[];let conversions:any[]=[];try{const response=await fetch(`${API}/products/${p.id}/units`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});if(response.ok){const data=await response.json();units=data.units||[];conversions=data.conversions||[];}}catch{}
    const today=localDate();const base=units.find(unit=>unit.is_base);const sellable=units.filter(unit=>unit.is_base||conversions.some((conversion:any)=>conversion.from_unit_id===unit.id&&conversion.to_unit_id===base?.id&&conversion.status==='approved'&&String(conversion.valid_from).slice(0,10)<=today&&(!conversion.valid_until||String(conversion.valid_until).slice(0,10)>=today))).map(unit=>({...unit,conversion_factor:unit.is_base?1:Number(conversions.find((conversion:any)=>conversion.from_unit_id===unit.id&&conversion.to_unit_id===base?.id&&conversion.status==='approved'&&String(conversion.valid_from).slice(0,10)<=today&&(!conversion.valid_until||String(conversion.valid_until).slice(0,10)>=today))?.factor||1)}));
    const defaultUnit=sellable.find(unit=>unit.is_base)||sellable[0];const conversionFactor=Number(defaultUnit?.conversion_factor||1);
    const matching=priceRules.filter(r=>r.product_id===p.id&&Number(r.min_quantity)<=1&&ruleIsCurrent(r)).sort((a,b)=>Number(b.min_quantity)-Number(a.min_quantity))[0];
    setCart(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      quantity: 1,
      unit_id:defaultUnit?.id,
      unit_code:defaultUnit?.unit_code||'unidad',
      conversion_factor:conversionFactor,
      units:sellable,
      unit_price: (matching?salePriceFromRule(matching):Number(p.sale_price || p.price || 0))*conversionFactor,
      discount: 0,
      tax_rate: Number(p.iva_rate ?? 13),
    }]);
    setProductSearch('');
  };

  const updateCart = (idx: number, field: keyof CartItem, value: any) => {
    setCart(prev => prev.map((c, i) => {if(i!==idx)return c;const next={...c,[field]:value};const product=products.find(p=>p.id===c.product_id);if(field==='quantity'&&selectedPriceList){const matching=priceRules.filter(r=>r.product_id===c.product_id&&Number(r.min_quantity)<=Number(value)&&ruleIsCurrent(r)).sort((a,b)=>Number(b.min_quantity)-Number(a.min_quantity))[0];next.unit_price=(matching?salePriceFromRule(matching):Number(product?.sale_price||product?.price||0))*c.conversion_factor;}if(field==='unit_id'){const unit=c.units.find(entry=>entry.id===value);next.unit_code=unit?.unit_code||'unidad';next.conversion_factor=Number(unit?.conversion_factor||1);const matching=selectedPriceList?priceRules.filter(r=>r.product_id===c.product_id&&Number(r.min_quantity)<=c.quantity&&ruleIsCurrent(r)).sort((a,b)=>Number(b.min_quantity)-Number(a.min_quantity))[0]:undefined;next.unit_price=(matching?salePriceFromRule(matching):Number(product?.sale_price||product?.price||0))*next.conversion_factor;}return next;}));
  };

  const removeFromCart = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const subtotal = cart.reduce((s, c) => s + Math.round(c.quantity * c.unit_price * (1 - c.discount / 100) * 100) / 100, 0);
  const discountAmt = subtotal * (globalDiscount / 100);
  const totalAmount = subtotal - discountAmt;
  const taxAmount = cart.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price * (1 - item.discount / 100) * (1 - globalDiscount / 100) * item.tax_rate), 0) / 100;
  const totalWithTax = totalAmount + taxAmount;
  const nonCashTotal = payments.filter(payment => payment.method !== 'cash').reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  let cashBalance = Math.max(0, totalWithTax - nonCashTotal);
  const recordedPayments = payments.map(payment => {
    const enteredAmount = Math.max(0, Number(payment.amount) || 0);
    const amount = payment.method === 'cash' ? Math.min(enteredAmount, cashBalance) : enteredAmount;
    if (payment.method === 'cash') cashBalance = Math.max(0, cashBalance - amount);
    return { ...payment, amount };
  });
  const totalPaid = recordedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const cashChange = payments.reduce((sum, payment, index) => sum + (payment.method === 'cash' ? Math.max(0, (Number(payment.amount) || 0) - recordedPayments[index].amount) : 0), 0);

  const handleSubmit = async () => {
    if (cart.length === 0) return showToast('Agrega al menos un producto', 'err');
    if (cart.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0 || item.unit_price < 0)) return showToast('Revisa cantidades y precios', 'err');
    if (totalPaid > totalWithTax + 0.01) return showToast('Los pagos distintos a efectivo superan el saldo', 'err');
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          customer_id: selectedCustomer || null,
          price_list_id: selectedPriceList || null,
          sale_date: saleDate,
          discount: globalDiscount,
          notes,
          pos_terminal: posTerminal,
          items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity, unit_id: c.unit_id || null, discount: c.discount })),
          payments: recordedPayments.filter(p => p.amount > 0).map(p => ({ method: p.method, amount: p.amount, reference: p.reference || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al crear venta');
      showToast(`${data.message} Ref. interna ${data.invoice_internal_number}. Documento electrónico SRI pendiente de emisión.`, 'ok');
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
    setSubmitting(false);
  };

  const openQuoteForm=async()=>{setShowQuoteForm(true);setQuoteCustomer('');setQuotePriceList('');setQuoteDiscount('0');setQuoteValidUntil('');setQuoteItems([{product_id:'',quantity:1,discount:0}]);try{const headers={Authorization:`Bearer ${localStorage.getItem('token')}`};const [cr,pr,lr]=await Promise.all([fetch(`${API}/customers`,{headers}),fetch(`${API}/products`,{headers}),fetch(`${API}/product-pricing/available`,{headers})]);const cd=cr.ok?await cr.json():[];setQuoteCustomers(Array.isArray(cd)?cd:cd.items||[]);setQuoteProducts(pr.ok?await pr.json():[]);setQuotePriceLists(lr.ok?await lr.json():[]);}catch{showToast('Error cargando datos para cotización','err');}};
  const saveQuote=async()=>{if(!quoteItems.length||quoteItems.some(item=>!item.product_id||item.quantity<1))return showToast('Selecciona productos y cantidades válidas','err');setSubmitting(true);try{const response=await fetch(`${API}/sales/quotes`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({customer_id:quoteCustomer||null,price_list_id:quotePriceList||null,discount:Number(quoteDiscount),valid_until:quoteValidUntil||null,items:quoteItems})});const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo crear la cotización.');showToast(`Cotización ${data.quote_number} creada.`,'ok');setShowQuoteForm(false);fetchData();}catch(error:any){showToast(error.message||'No se pudo crear la cotización.','err');}finally{setSubmitting(false);}};

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
                  <h3><TrendingUp size={16}/> Top Vendedores</h3>
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
                  <h3><ShoppingBag size={16}/> Productos Top</h3>
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
                  <h3><CreditCard size={16}/> Cuentas por Cobrar</h3>
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
          <>
          <div className="filters-bar"><span className="page-subtitle">Cotizaciones con precio aprobado y vigencia registrada.</span><button className="btn-confirm" onClick={()=>void openQuoteForm()}><Plus size={16}/> Nueva cotización</button></div>
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
                      <td>{q.valid_until?new Date(q.valid_until).toLocaleDateString():'—'}</td>
                      <td><strong className="amount">{fmt(q.total_amount)}</strong></td>
                      <td><StatusBadge status={q.status} /></td>
                      <td><button className="btn-detail">Convertir a Venta</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </>
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
                      <label>Cajero</label>
                      <input value={user?.username || 'Sesión actual'} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Cliente</label>
                      <select value={selectedCustomer} onChange={e => void changeSaleCustomer(e.target.value)}>
                        <option value="">Consumidor final</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Lista de precios</label>
                      <select value={selectedPriceList} onChange={e=>{const id=e.target.value;setSelectedPriceList(id);const max=Number(priceLists.find(list=>list.id===id)?.max_discount_percent||0);setGlobalDiscount(current=>Math.min(current,max));}}>
                        <option value="">Precio base del producto</option>
                        {priceLists.map(list=><option key={list.id} value={list.id}>{list.name} · {list.list_type} · {list.currency}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Fecha</label>
                      <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Terminal POS / caja</label>
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
                      <span>Producto</span><span>Unidad</span><span>Cant.</span><span>Precio</span><span>IVA</span><span>Total</span><span></span>
                    </div>
                    {cart.map((item, idx) => (
                      <div key={idx} className="cart-row">
                        <span className="cart-prod-name">{item.product_name}</span>
                        <select className="cart-unit" value={item.unit_id || ''} onChange={e => updateCart(idx, 'unit_id', e.target.value)} aria-label={`Unidad para ${item.product_name}`}>
                          {item.units.length ? item.units.map(unit => <option key={unit.id} value={unit.id}>{unit.unit_code}</option>) : <option value="">unidad</option>}
                        </select>
                        <input type="number" min="0.000001" step={item.units.find(unit=>unit.id===item.unit_id)?.precision_scale ? `0.${'0'.repeat(Math.max(0,item.units.find(unit=>unit.id===item.unit_id)!.precision_scale-1))}1` : '1'} value={item.quantity} onChange={e => updateCart(idx, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="cart-input" />
                        <span className="cart-price">{fmt(item.unit_price)}</span>
                        <span className="cart-tax">{item.tax_rate}%</span>
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
                    <div className="summary-row"><span>Descuento total</span><span>−{fmt(discountAmt)}</span></div>
                    <div className="summary-row">
                      <span>Descuento</span>
                      <div className="discount-input-wrap">
                        <input type="number" min="0" max={selectedPriceList?Number(priceLists.find(list=>list.id===selectedPriceList)?.max_discount_percent||0):100} step="0.01" value={globalDiscount} onChange={e => setGlobalDiscount(parseFloat(e.target.value) || 0)} className="discount-input" />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="summary-row"><span>IVA por tarifa</span><span>{fmt(taxAmount)}</span></div>
                    <div className="summary-divider" />
                    <div className="summary-row total-row"><strong>TOTAL</strong><strong className="total-amount">{fmt(totalWithTax)}</strong></div>
                  </div>

                  <div className="payments-card">
                    <h3>Pago</h3>
                    {payments.map((pay, idx) => (
                      <div key={idx} className="payment-row">
                        <select value={pay.method} onChange={e => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, method: e.target.value } : p))}>
                          {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <input type="number" min="0" step="0.01" placeholder="Monto recibido" value={pay.amount} onChange={e => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, amount: e.target.value } : p))} />
                        <input type="text" placeholder="Referencia (opcional)" value={pay.reference} onChange={e => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, reference: e.target.value } : p))} />
                        {payments.length > 1 && <button type="button" className="cart-remove" aria-label="Quitar pago" onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))}><X size={14} /></button>}
                      </div>
                    ))}
                    <button type="button" className="add-payment" onClick={() => setPayments(prev => [...prev, { method: 'transfer', amount: '', reference: '' }])}><Plus size={14} /> Añadir otro medio de pago</button>
                    <div className={`pay-diff ${totalPaid >= totalWithTax ? 'paid' : totalPaid > 0 ? 'partial' : 'pending'}`}>
                      {totalPaid >= totalWithTax ? `Pagado · cambio ${fmt(cashChange)}` : `Pendiente: ${fmt(totalWithTax - totalPaid)}`}
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
        {showQuoteForm&&<div className="modal-overlay"><div className="modal-panel quote-panel"><div className="modal-header"><div><h2>Nueva cotización</h2><p>Los precios se calculan en el servidor con la lista seleccionada.</p></div><button className="cart-remove" onClick={()=>setShowQuoteForm(false)} aria-label="Cerrar"><X size={18}/></button></div><div className="modal-left quote-form-body"><div className="form-row"><div className="form-group"><label>Cliente</label><select value={quoteCustomer} onChange={async e=>{const value=e.target.value;setQuoteCustomer(value);try{const response=await fetch(`${API}/product-pricing/available${value?`?customer_id=${encodeURIComponent(value)}`:''}`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});setQuotePriceLists(response.ok?await response.json():[]);setQuotePriceList('');}catch{setQuotePriceLists([]);}}}><option value="">Consumidor final</option>{quoteCustomers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div className="form-group"><label>Lista aprobada</label><select value={quotePriceList} onChange={e=>setQuotePriceList(e.target.value)}><option value="">Precio vigente del producto (USD)</option>{quotePriceLists.map(list=><option key={list.id} value={list.id}>{list.name} · {list.currency}</option>)}</select></div><div className="form-group"><label>Vigente hasta</label><input type="date" value={quoteValidUntil} onChange={e=>setQuoteValidUntil(e.target.value)}/></div><div className="form-group"><label>Descuento general (%)</label><input type="number" min="0" max="100" step="0.01" value={quoteDiscount} onChange={e=>setQuoteDiscount(e.target.value)}/></div></div><div className="cart-section"><div className="quote-line-heading"><span>Producto</span><span>Cantidad</span><span>Desc. %</span><span></span></div>{quoteItems.map((item,index)=><div className="quote-line-heading" key={index}><select value={item.product_id} onChange={e=>setQuoteItems(rows=>rows.map((row,i)=>i===index?{...row,product_id:e.target.value}:row))}><option value="">Seleccionar producto</option>{quoteProducts.map(product=><option key={product.id} value={product.id}>{product.name}{product.sku?` · ${product.sku}`:''}</option>)}</select><input type="number" min="1" step="1" value={item.quantity} onChange={e=>setQuoteItems(rows=>rows.map((row,i)=>i===index?{...row,quantity:Number(e.target.value)}:row))}/><input type="number" min="0" max="100" step="0.01" value={item.discount} onChange={e=>setQuoteItems(rows=>rows.map((row,i)=>i===index?{...row,discount:Number(e.target.value)}:row))}/><button className="cart-remove" aria-label="Quitar línea" onClick={()=>setQuoteItems(rows=>rows.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div><button className="add-payment" onClick={()=>setQuoteItems(rows=>[...rows,{product_id:'',quantity:1,discount:0}])}><Plus size={14}/> Añadir producto</button><footer className="quote-actions"><button className="settings-secondary-button" onClick={()=>setShowQuoteForm(false)}>Cancelar</button><button className="btn-confirm" disabled={submitting||!quoteItems.length} onClick={()=>void saveQuote()}>{submitting?'Guardando…':'Crear cotización'}</button></footer></div></div></div>}
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
        .tab-btn.active { color: var(--action-color, var(--primary)); border-bottom-color: var(--action-color, var(--primary)); }

        .filters-bar { display: flex; gap: 16px; margin-bottom: 20px; align-items: center; }
        .search-box { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 0 14px; height: 42px; }
        .search-box input { border: none; outline: none; width: 100%; font-size: 0.9rem; background: transparent; color: var(--foreground); }
        
        .filter-tabs { display: flex; gap: 4px; }
        .filter-tab { padding: 6px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; background: var(--card); border: 1px solid var(--border); color: var(--muted-foreground); cursor: pointer; }
        .filter-tab.active { background: var(--action-color, var(--primary)); color: var(--primary-foreground); border-color: var(--action-color, var(--primary)); }

        .table-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th { background: var(--background); padding: 12px 16px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--muted-foreground); border-bottom: 1px solid var(--border); }
        .table-row td { padding: 16px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        .table-row:hover td { background: var(--background); }
        .sale-num { font-family: monospace; font-weight: 700; color: #3182ce; }
        .amount { color: #064035; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); border-radius: 16px; width: 100%; max-width: 1000px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
        .quote-panel { max-width: 760px; }
        .quote-form-body { flex: 1; overflow-y: auto; }
        .quote-line-heading { display: grid; grid-template-columns: minmax(140px,1fr) 100px 100px 32px; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid var(--border); }
        .quote-line-heading input,.quote-line-heading select { min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); color: var(--foreground); }
        .quote-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; }
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
        .cart-header-row { display: grid; grid-template-columns: minmax(100px, 2fr) 76px 64px 75px 40px 80px 32px; gap: 8px; padding: 10px; background: var(--background); font-size: 0.7rem; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; }
        .cart-row { display: grid; grid-template-columns: minmax(100px, 2fr) 76px 64px 75px 40px 80px 32px; gap: 8px; padding: 10px; border-bottom: 1px solid var(--border); align-items: center; }
        .cart-input { width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; text-align: center; font-size: 0.85rem; }
        .cart-unit { width: 100%; min-width: 0; padding: 6px 3px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--foreground); font-size: 0.78rem; }
        .cart-prod-name { font-size: 0.85rem; font-weight: 600; }
        .cart-price { text-align: right; font-size: 0.82rem; }
        .cart-line-total { font-weight: 700; text-align: right; font-size: 0.85rem; }

        .summary-card, .payments-card { background: var(--card); padding: 16px; border-radius: 12px; border: 1px solid var(--border); }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; }
        .total-amount { font-size: 1.4rem; color: #064035; font-weight: 800; }
        
        .payment-row { display: grid; grid-template-columns: 1fr 1fr 1fr 32px; gap: 8px; margin-bottom: 8px; }
        .payment-row select, .payment-row input { min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); color: var(--foreground); }
        .add-payment { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #064035; font-weight: 700; cursor: pointer; padding: 8px 0; }
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
