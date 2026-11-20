'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import {
  ArrowLeft, ShoppingBag, CreditCard, Package, User,
  Calendar, Hash, CheckCircle, AlertCircle, RefreshCw,
  Banknote, Smartphone, TrendingUp, XCircle
} from 'lucide-react';

const API = '/api';
const fmt = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_MAP: Record<string, { bg: string; color: string; label: string; icon: any }> = {
  completed: { bg: '#dcfce7', color: '#166534', label: 'Completada', icon: CheckCircle },
  cancelled:  { bg: '#fee2e2', color: '#991b1b', label: 'Cancelada',  icon: XCircle },
  draft:      { bg: '#fef9c3', color: '#713f12', label: 'Borrador',   icon: AlertCircle },
  refunded:   { bg: '#e0e7ff', color: '#3730a3', label: 'Devuelta',   icon: RefreshCw },
};

const PAY_MAP: Record<string, { bg: string; color: string; label: string }> = {
  paid:    { bg: '#dcfce7', color: '#166534', label: 'Pagado' },
  pending: { bg: '#fef9c3', color: '#713f12', label: 'Pendiente' },
  partial: { bg: '#ffedd5', color: '#9a3412', label: 'Parcial' },
};

const METHOD_ICONS: Record<string, any> = {
  cash: Banknote, card: CreditCard, transfer: TrendingUp, mobile_payment: Smartphone, credit: CreditCard,
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', mobile_payment: 'Pago Móvil', credit: 'Crédito',
};

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sale, setSale] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSale = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/sales/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('No encontrada');
      setSale(await res.json());
    } catch {
      showToast('Error cargando venta', 'err');
    }
    setLoading(false);
  };

  useEffect(() => { fetchSale(); }, [id]);

  const handleCancel = async () => {
    if (!confirm('¿Cancelar esta venta? Se revertirá el stock.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API}/sales/${id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast('Venta cancelada. Stock revertido.', 'ok');
      fetchSale();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
    setCancelling(false);
  };

  const handleAddPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return showToast('Ingresa monto válido', 'err');
    setPaySubmitting(true);
    try {
      const res = await fetch(`${API}/sales/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ method: payMethod, amount: parseFloat(payAmount), reference: payRef || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast('Pago registrado', 'ok');
      setShowAddPayment(false); setPayAmount(''); setPayRef('');
      fetchSale();
    } catch (e: any) {
      showToast(e.message, 'err');
    }
    setPaySubmitting(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12, color: 'var(--muted-foreground)' }}>
      <RefreshCw size={24} className="spin" /><span>Cargando venta...</span>
    </div>
  );

  if (!sale) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12 }}>
      <AlertCircle size={48} color="#dc2626" />
      <h2>Venta no encontrada</h2>
      <button onClick={() => router.push('/sales')} className="btn-back">← Volver</button>
    </div>
  );

  const status = STATUS_MAP[sale.status] ?? { bg: '#f3f4f6', color: '#374151', label: sale.status, icon: AlertCircle };
  const payStatus = PAY_MAP[sale.payment_status] ?? { bg: '#f3f4f6', color: '#374151', label: sale.payment_status };
  const totalPaid = (sale.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const remaining = Number(sale.total_amount) - totalPaid;
  const StatusIcon = status.icon;

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />
      <div className="detail-page">
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'ok' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="detail-header">
        <button className="btn-back" onClick={() => router.push('/sales')}>
          <ArrowLeft size={18} /> Volver
        </button>
        <div className="detail-title-wrap">
          <h1><ShoppingBag size={20} /> {sale.sale_number || 'Venta'}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ background: status.bg, color: status.color, padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusIcon size={14} /> {status.label}
            </span>
            <span style={{ background: payStatus.bg, color: payStatus.color, padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
              {payStatus.label}
            </span>
          </div>
        </div>
        {sale.status !== 'cancelled' && (
          <button className="btn-cancel" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <RefreshCw size={16} className="spin" /> : <XCircle size={16} />}
            Cancelar Venta
          </button>
        )}
      </div>

      <div className="detail-grid">
        {/* INFO CARD */}
        <div className="info-card card">
          <h3>Información de la Venta</h3>
          <div className="info-rows">
            <div className="info-row"><User size={16} /><span className="info-label">Cliente</span><strong>{sale.customer_name || 'General'}</strong></div>
            {sale.customer_phone && <div className="info-row"><Smartphone size={16} /><span className="info-label">Teléfono</span><span>{sale.customer_phone}</span></div>}
            <div className="info-row"><Calendar size={16} /><span className="info-label">Fecha</span><span>{new Date(sale.sale_date).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
            <div className="info-row"><Hash size={16} /><span className="info-label">Número</span><span className="mono">{sale.sale_number || '—'}</span></div>
          </div>
          {sale.notes && <div className="notes-box"><strong>Notas:</strong> {sale.notes}</div>}
        </div>

        {/* TOTALS CARD */}
        <div className="totals-card card">
          <h3>Resumen Financiero</h3>
          <div className="total-rows">
            <div className="total-row"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
            {Number(sale.discount) > 0 && <div className="total-row discount"><span>Descuento</span><span>-{fmt(sale.discount)}</span></div>}
            {Number(sale.tax) > 0 && <div className="total-row"><span>Impuesto</span><span>{fmt(sale.tax)}</span></div>}
            <div className="total-divider" />
            <div className="total-row grand-total"><strong>TOTAL</strong><strong className="big-total">{fmt(sale.total_amount)}</strong></div>
            <div className="total-divider" />
            <div className="total-row"><span>Pagado</span><span style={{ color: '#166534', fontWeight: 700 }}>{fmt(totalPaid)}</span></div>
            {remaining > 0 && (
              <div className="total-row"><span>Pendiente</span><span style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(remaining)}</span></div>
            )}
          </div>
        </div>

        {/* ITEMS TABLE */}
        <div className="items-section card">
          <h3><Package size={18} /> Productos Vendidos</h3>
          <table className="items-table">
            <thead>
              <tr><th>Producto</th><th>SKU</th><th>Lote</th><th>Cantidad</th><th>Precio</th><th>Desc.</th><th>Total</th></tr>
            </thead>
            <tbody>
              {(sale.items ?? []).map((item: any, idx: number) => (
                <tr key={idx}>
                  <td><strong>{item.product_name}</strong></td>
                  <td><span className="mono">{item.sku}</span></td>
                  <td><span className="mono">{item.batch_number}</span></td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td>{fmt(item.unit_price)}</td>
                  <td>{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                  <td><strong>{fmt(item.total_amount)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(sale.items ?? []).length === 0 && <div className="empty-items">No hay ítems registrados</div>}
        </div>

        {/* PAYMENTS */}
        <div className="payments-section card">
          <div className="payments-header">
            <h3><CreditCard size={18} /> Pagos Registrados</h3>
            {sale.status !== 'cancelled' && remaining > 0 && (
              <button className="btn-add-pay" onClick={() => setShowAddPayment(!showAddPayment)}>
                + Agregar Pago
              </button>
            )}
          </div>

          {showAddPayment && (
            <div className="add-payment-form">
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
                <option value="mobile_payment">Pago Móvil</option>
                <option value="credit">Crédito</option>
              </select>
              <input type="number" placeholder={`Monto (pendiente: ${fmt(remaining)})`} value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              <input type="text" placeholder="Referencia (opcional)" value={payRef} onChange={e => setPayRef(e.target.value)} />
              <button className="btn-confirm-pay" onClick={handleAddPayment} disabled={paySubmitting}>
                {paySubmitting ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />} Confirmar
              </button>
            </div>
          )}

          <div className="payments-list">
            {(sale.payments ?? []).length === 0 && <div className="empty-items">Sin pagos registrados</div>}
            {(sale.payments ?? []).map((pay: any, idx: number) => {
              const MethodIcon = METHOD_ICONS[pay.method] ?? CreditCard;
              return (
                <div key={idx} className="payment-item">
                  <div className="pay-method-icon"><MethodIcon size={18} /></div>
                  <div className="pay-details">
                    <span className="pay-method-label">{METHOD_LABELS[pay.method] ?? pay.method}</span>
                    {pay.reference && <span className="pay-ref">Ref: {pay.reference}</span>}
                    <span className="pay-date">{new Date(pay.payment_date).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span className="pay-amount">{fmt(pay.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      </div>
      <style jsx>{`
        .detail-page { padding: 32px; max-width: 1300px; margin: 0 auto; }
        
        .toast { position: fixed; top: 24px; right: 24px; z-index: 9999; display: flex; align-items: center; gap: 10px;
          padding: 14px 20px; border-radius: 12px; font-weight: 600; font-size: 0.9rem; box-shadow: 0 8px 24px rgba(0,0,0,0.15); animation: slideIn 0.3s ease; }
        .toast.ok { background: #064035; color: #fff; }
        .toast.err { background: #dc2626; color: #fff; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }

        .detail-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
        .btn-back { display: flex; align-items: center; gap: 8px; background: var(--secondary); border: 1px solid var(--border);
          border-radius: 10px; padding: 9px 16px; font-weight: 600; font-size: 0.9rem; color: var(--foreground); transition: all 0.2s; }
        .btn-back:hover { background: var(--border); }
        .detail-title-wrap { flex: 1; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .detail-title-wrap h1 { display: flex; align-items: center; gap: 10px; font-size: 1.6rem; margin: 0; }
        .btn-cancel { display: flex; align-items: center; gap: 8px; background: #fee2e2; color: #991b1b;
          border: 1px solid #fca5a5; border-radius: 10px; padding: 9px 16px; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; }
        .btn-cancel:hover:not(:disabled) { background: #dc2626; color: white; }
        .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

        .detail-grid { display: grid; grid-template-columns: 3fr 2fr; grid-template-rows: auto auto; gap: 20px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-md); }
        .card h3 { display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 800; margin: 0 0 18px;
          text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted-foreground); }

        .info-rows { display: flex; flex-direction: column; gap: 12px; }
        .info-row { display: flex; align-items: center; gap: 12px; font-size: 0.9rem; color: var(--foreground); }
        .info-label { color: var(--muted-foreground); width: 80px; flex-shrink: 0; font-size: 0.82rem; }
        .mono { font-family: monospace; font-weight: 700; color: #3182ce; }
        .notes-box { margin-top: 16px; background: var(--secondary); border-radius: 10px; padding: 12px 14px; font-size: 0.88rem; color: var(--foreground); }

        .total-rows { display: flex; flex-direction: column; gap: 8px; }
        .total-row { display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--foreground); }
        .total-divider { border: none; border-top: 1px solid var(--border); margin: 4px 0; }
        .discount { color: #dc2626; }
        .grand-total { font-size: 1rem; }
        .big-total { font-size: 1.4rem; color: #064035; font-weight: 800; }

        .items-section { grid-column: 1 / -1; }
        .items-table { width: 100%; border-collapse: collapse; }
        .items-table th { background: var(--secondary); padding: 10px 14px; font-size: 0.78rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted-foreground); text-align: left; border-bottom: 1px solid var(--border); }
        .items-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--foreground); }
        .items-table tr:last-child td { border-bottom: none; }
        .items-table tr:hover td { background: var(--secondary); }
        .empty-items { text-align: center; padding: 24px; color: var(--muted-foreground); font-size: 0.88rem; }

        .payments-section { }
        .payments-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .payments-header h3 { margin: 0; }
        .btn-add-pay { background: #064035; color: white; padding: 7px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; transition: all 0.2s; }
        .btn-add-pay:hover { background: #0a5748; }
        .add-payment-form { display: grid; grid-template-columns: 1fr 1.2fr 1.2fr auto; gap: 10px; margin-bottom: 16px;
          background: var(--secondary); border-radius: 12px; padding: 14px; }
        .add-payment-form select, .add-payment-form input { background: var(--card); border: 1px solid var(--border);
          border-radius: 8px; padding: 8px 12px; font-size: 0.88rem; color: var(--foreground); outline: none; font-family: inherit; }
        .btn-confirm-pay { background: #064035; color: white; padding: 8px 16px; border-radius: 8px; font-weight: 700;
          font-size: 0.85rem; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .btn-confirm-pay:disabled { opacity: 0.5; }
        .payments-list { display: flex; flex-direction: column; gap: 10px; }
        .payment-item { display: flex; align-items: center; gap: 14px; padding: 12px 16px; background: var(--secondary); border-radius: 12px; }
        .pay-method-icon { width: 40px; height: 40px; background: #064035; color: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pay-details { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .pay-method-label { font-weight: 700; font-size: 0.9rem; color: var(--foreground); }
        .pay-ref { font-size: 0.8rem; color: var(--muted-foreground); }
        .pay-date { font-size: 0.78rem; color: var(--muted-foreground); }
        .pay-amount { font-size: 1.1rem; font-weight: 800; color: #064035; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 900px) {
          .detail-grid { grid-template-columns: 1fr; }
          .items-section { grid-column: 1; }
          .add-payment-form { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .detail-page { padding: 16px; }
          .detail-header { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
