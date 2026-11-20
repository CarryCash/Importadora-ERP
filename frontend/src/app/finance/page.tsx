'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Navbar from '../../components/Navbar';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  Plus, 
  Calendar, 
  Tag, 
  FileText,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Landmark,
  Wallet
} from 'lucide-react';

const API = '/api';

interface FinanceSummary {
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  debtors: number;
  creditors: number;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: 'Operativo',
    date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [summaryRes, expensesRes] = await Promise.all([
        fetch(`${API}/finance/summary`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/finance/expenses`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (expensesRes.ok) setExpenses(await expensesRes.json());
    } catch (err) {
      console.error('Error fetching finance data:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API}/finance/expenses`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        })
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ description: '', amount: '', category: 'Operativo', date: new Date().toISOString().split('T')[0] });
        fetchData();
      }
    } catch (err) {
      console.error('Error saving expense:', err);
    }
    setSaving(false);
  };

  if (loading && !summary) {
    return (
      <div className="loading-screen">
        <RefreshCw size={40} className="spin" />
        <span>Cargando estados financieros...</span>
      </div>
    );
  }

  const profitMargin = summary ? (summary.netProfit / summary.revenue) * 100 : 0;

  return (
    <div className="finance-layout">
      <Navbar />
      
      <main className="finance-main">
        <header className="page-header">
          <div className="header-info">
            <h1>Gestión Financiera y Utilidades</h1>
            <p>Control de ingresos, costos operativos y flujo de caja real.</p>
          </div>
          <div className="header-actions">
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={18} /> Registrar Gasto
            </button>
          </div>
        </header>

        {/* ─── Top Cards (Summary) ─── */}
        <div className="summary-grid">
          <div className="card summary-card income">
            <div className="card-icon"><TrendingUp size={24} /></div>
            <div className="card-data">
              <span className="label">Ingresos Totales (Ventas)</span>
              <span className="value">${summary?.revenue.toLocaleString()}</span>
            </div>
            <div className="card-badge positive"><ArrowUpRight size={14} /> Facturación Bruta</div>
          </div>

          <div className="card summary-card costs">
            <div className="card-icon"><TrendingDown size={24} /></div>
            <div className="card-data">
              <span className="label">Costo de Ventas (COGS)</span>
              <span className="value">-${summary?.cogs.toLocaleString()}</span>
            </div>
            <div className="card-badge warning">Costo de Mercancía</div>
          </div>

          <div className="card summary-card expenses">
            <div className="card-icon"><Wallet size={24} /></div>
            <div className="card-data">
              <span className="label">Gastos Operativos</span>
              <span className="value">-${summary?.expenses.toLocaleString()}</span>
            </div>
            <div className="card-badge danger">Egresos Administrativos</div>
          </div>

          <div className="card summary-card profit highlight">
            <div className="card-icon"><DollarSign size={24} /></div>
            <div className="card-data">
              <span className="label">Utilidad Neta Real</span>
              <span className="value">${summary?.netProfit.toLocaleString()}</span>
            </div>
            <div className={`profit-indicator ${profitMargin > 15 ? 'good' : 'warning'}`}>
              Margen: {profitMargin.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="finance-grid">
          {/* ─── Debt Management ─── */}
          <div className="left-column">
            <div className="card table-card-premium">
              <div className="card-header-premium">
                <h3>Balance de Cartera y Proveedores</h3>
                <p className="card-desc">Cuentas por cobrar vs Cuentas por pagar</p>
              </div>
              <div className="debt-comparison">
                <div className="debt-item receivable">
                  <div className="d-info">
                    <span className="d-label">Cuentas por Cobrar</span>
                    <span className="d-value">${summary?.debtors.toLocaleString()}</span>
                  </div>
                  <div className="d-bar-bg"><div className="d-bar-fill" style={{ width: '100%' }}></div></div>
                </div>
                <div className="debt-item payable">
                  <div className="d-info">
                    <span className="d-label">Cuentas por Pagar</span>
                    <span className="d-value">${summary?.creditors.toLocaleString()}</span>
                  </div>
                  <div className="d-bar-bg"><div className="d-bar-fill" style={{ width: `${(summary?.creditors! / summary?.debtors!) * 100}%` }}></div></div>
                </div>
              </div>
            </div>

            {/* ─── Expenses List ─── */}
            <div className="card table-card-premium" style={{ marginTop: '24px' }}>
              <div className="card-header-premium">
                <h3>Registro de Gastos Recientes</h3>
                <button className="btn-simple">Ver Todo</button>
              </div>
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Categoría</th>
                      <th>Fecha</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 && (
                      <tr><td colSpan={4} className="empty-cell">No hay gastos registrados.</td></tr>
                    )}
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="font-medium">{e.description}</td>
                        <td><span className="category-pill">{e.category}</span></td>
                        <td>{new Date(e.date).toLocaleDateString()}</td>
                        <td className="text-danger font-bold">-${parseFloat(e.amount as any).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="right-column">
            {/* Quick Tips / Strategy */}
            <div className="card strategy-card">
              <div className="strategy-header">
                <PieChart size={24} />
                <h3>Análisis de Salud Financiera</h3>
              </div>
              <div className="strategy-body">
                <p>Tu margen de utilidad actual es del <strong>{profitMargin.toFixed(1)}%</strong>.</p>
                <div className="strategy-alert">
                   <AlertCircle size={18} />
                   <span>Recuerda que el COGS es una estimación basada en el costo unitario de los lotes vendidos.</span>
                </div>
                <div className="kpi-mini">
                   <div className="k-item">
                     <span>Ratio Cobro/Pago</span>
                     <strong>{(summary?.debtors! / summary?.creditors!).toFixed(2)}x</strong>
                   </div>
                   <div className="k-item">
                     <span>Gastos vs Ingresos</span>
                     <strong>{((summary?.expenses! / summary?.revenue!) * 100).toFixed(1)}%</strong>
                   </div>
                </div>
              </div>
            </div>

            {/* Ledger Placeholder / Graphic */}
            <div className="card ledger-card">
               <h3>Distribución de Egresos</h3>
               <div className="chart-placeholder">
                  <div className="donut-sim">
                    <div className="donut-text">
                       <span>Egresos</span>
                       <strong>${(summary?.cogs! + summary?.expenses!).toLocaleString()}</strong>
                    </div>
                  </div>
                  <ul className="chart-legend">
                    <li><span className="dot cogs"></span> COGS ({(summary?.cogs! / (summary?.cogs! + summary?.expenses!) * 100).toFixed(0)}%)</li>
                    <li><span className="dot exp"></span> Gastos ({(summary?.expenses! / (summary?.cogs! + summary?.expenses!) * 100).toFixed(0)}%)</li>
                  </ul>
               </div>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Modal Registrar Gasto ─── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-panel">
            <div className="modal-header">
              <h2><Plus size={20} /> Registrar Gasto Operativo</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSaveExpense}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Descripción del Gasto</label>
                  <input 
                    required 
                    placeholder="Ej. Pago de Alquiler Bodega, Publicidad FB, etc."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Monto ($)</label>
                    <input 
                      type="number" 
                      required 
                      step="0.01"
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={e => setFormData({...formData, amount: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Categoría</label>
                    <select 
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                    >
                      <option value="Operativo">Operativo</option>
                      <option value="Marketing">Marketing / Publicidad</option>
                      <option value="Logística">Logística / Transporte</option>
                      <option value="Personal">Personal / Salarios</option>
                      <option value="Servicios">Servicios Básicos</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input 
                    type="date" 
                    required
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={saving}>
                  {saving ? 'Procesando...' : 'Guardar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .finance-layout { min-height: 100vh; background: var(--background); font-family: 'Inter', sans-serif; }
        .finance-main { max-width: 1400px; margin: 0 auto; padding: 32px 40px; }
        
        .page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
        .header-info h1 { font-size: 1.875rem; font-weight: 800; color: var(--foreground); margin: 0; }
        .header-info p { color: var(--muted-foreground); font-size: 1rem; margin-top: 4px; }
        
        .btn-primary { background: #064035; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }

        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-bottom: 32px; }
        .summary-card { background: var(--card); padding: 24px; border-radius: 20px; border: 1px solid var(--border); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 12px; }
        .summary-card.highlight { background: var(--action-color, var(--primary)); color: var(--primary-foreground); border: none; }
        .summary-card.highlight .label { color: rgba(255,255,255,0.7); }
        .summary-card.highlight .value { color: var(--primary-foreground); }
        
        .card-icon { width: 48px; height: 48px; border-radius: 14px; background: var(--secondary); display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); }
        .summary-card.highlight .card-icon { background: color-mix(in srgb, var(--primary-foreground) 14%, transparent); color: var(--primary-foreground); }
        
        .card-data .label { font-size: 0.8rem; font-weight: 600; color: var(--muted-foreground); }
        .card-data .value { font-size: 1.5rem; font-weight: 800; color: var(--foreground); display: block; margin-top: 4px; }
        
        .card-badge { font-size: 0.7rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; width: fit-content; display: flex; align-items: center; gap: 4px; }
        .card-badge.positive { background: color-mix(in srgb, var(--action-color, var(--primary)) 12%, var(--card)); color: var(--action-color, var(--primary)); }
        .card-badge.warning { background: #fffbeb; color: #b45309; }
        .card-badge.danger { background: #fef2f2; color: #991b1b; }
        
        .profit-indicator { font-size: 0.8rem; font-weight: 700; padding: 4px 12px; border-radius: 20px; width: fit-content; }
        .profit-indicator.good { background: var(--action-color, var(--primary)); color: var(--primary-foreground); }

        .finance-grid { display: grid; grid-template-columns: 1fr 400px; gap: 32px; }
        
        .card { background: var(--card); border-radius: 20px; border: 1px solid var(--border); }
        .table-card-premium { overflow: hidden; }
        .card-header-premium { padding: 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .card-header-premium h3 { font-size: 1.1rem; font-weight: 800; color: var(--foreground); margin: 0; }
        .card-desc { font-size: 0.85rem; color: var(--muted-foreground); margin-top: 2px; }

        .debt-comparison { padding: 32px; display: flex; flex-direction: column; gap: 24px; }
        .debt-item { display: flex; flex-direction: column; gap: 10px; }
        .d-info { display: flex; justify-content: space-between; align-items: flex-end; }
        .d-label { font-size: 0.9rem; font-weight: 600; color: var(--muted-foreground); }
        .d-value { font-size: 1.25rem; font-weight: 800; color: var(--foreground); }
        .d-bar-bg { height: 8px; background: var(--secondary); border-radius: 4px; overflow: hidden; }
        .d-bar-fill { height: 100%; border-radius: 4px; }
        .receivable .d-bar-fill { background: #3b82f6; }
        .payable .d-bar-fill { background: #ef4444; }

        .premium-table { width: 100%; border-collapse: collapse; }
        .premium-table th { background: var(--background); padding: 14px 24px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--muted-foreground); letter-spacing: 0.05em; }
        .premium-table td { padding: 16px 24px; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        .category-pill { background: var(--secondary); color: var(--muted-foreground); padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; }
        .text-danger { color: #ef4444; }
        .font-bold { font-weight: 800; }

        .strategy-card { padding: 24px; background: var(--secondary); color: var(--foreground); border: 1px solid var(--border); }
        .strategy-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .strategy-header h3 { font-size: 1.1rem; font-weight: 800; margin: 0; }
        .strategy-body p { font-size: 0.95rem; line-height: 1.6; opacity: 0.9; }
        .strategy-alert { background: var(--card); padding: 16px; border-radius: 12px; display: flex; gap: 12px; font-size: 0.85rem; margin-top: 20px; }
        .kpi-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
        .k-item { background: var(--card); padding: 12px; border-radius: 10px; display: flex; flex-direction: column; }
        .k-item span { font-size: 0.7rem; color: var(--muted-foreground); }
        .k-item strong { font-size: 1.1rem; }

        .ledger-card { padding: 24px; margin-top: 24px; }
        .ledger-card h3 { font-size: 1rem; font-weight: 800; margin-bottom: 24px; }
        .chart-placeholder { display: flex; flex-direction: column; align-items: center; gap: 24px; }
        .donut-sim { width: 160px; height: 160px; border-radius: 50%; border: 20px solid var(--secondary); position: relative; display: flex; align-items: center; justify-content: center; border-left-color: var(--action-color, var(--primary)); border-top-color: var(--action-color, var(--primary)); }
        .donut-text { text-align: center; }
        .donut-text span { font-size: 0.7rem; color: var(--muted-foreground); display: block; }
        .donut-text strong { font-size: 1rem; color: var(--foreground); }
        .chart-legend { list-style: none; padding: 0; display: flex; gap: 20px; }
        .chart-legend li { font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; }
        .dot.cogs { background: var(--action-color, var(--primary)); }
        .dot.exp { background: var(--border); }

        .loading-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; gap: 16px; color: var(--action-color, var(--primary)); font-weight: 700; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); border-radius: 20px; width: 100%; max-width: 500px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .modal-header h2 { font-size: 1.1rem; font-weight: 800; margin: 0; }
        .close-btn { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; }
        .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 0.8rem; font-weight: 700; color: var(--muted-foreground); }
        .form-group input, .form-group select { padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.95rem; outline: none; }
        .modal-footer { padding: 20px 24px; background: var(--background); border-top: 1px solid var(--secondary); display: flex; justify-content: flex-end; gap: 12px; }
        .btn-secondary { background: var(--card); border: 1px solid var(--border); padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; }
        .btn-confirm { background: #064035; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 700; cursor: pointer; }

        @media (max-width: 1200px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .finance-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
