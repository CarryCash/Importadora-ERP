'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Navbar from '../../components/Navbar';
import { 
  Package, Search, Filter, AlertTriangle, 
  CheckCircle, Clock, Calendar, Bookmark,
  Navigation, RefreshCw, ChevronDown, X, MessageSquare,
  BookOpen, Edit3, ArrowUp, ArrowDown, Info
} from 'lucide-react';

interface InventoryItem {
  inventory_id: string;
  quantity: number;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: string;
  bin_location: string;
  batch_number: string;
  expiration_date: string;
  product_name: string;
  sku: string;
  brand: string;
  batch_id: string;
  product_id: string;
  min_stock: number;
  lead_time_days: number;
  unit_cost: number;
}

interface Warehouse {
  id: string;
  name: string;
  code: string;
  type: string;
}

interface TraceabilityItem {
  sale_number: string;
  sale_date: string;
  quantity_delivered: number;
  customer_name: string;
  customer_phone: string;
  business_name: string;
}

interface ForecastingItem {
  product_id: string;
  product_name: string;
  sku: string;
  lead_time_days: number;
  current_stock: number;
  ads: number;
  total_sold_30d: number;
  days_left: number;
}

interface KardexMovement {
  id: string;
  movement_type: string;
  quantity_change: number;
  notes: string;
  created_at: string;
  user_name: string;
}

const API = 'http://localhost:3000/api';

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'expired' | 'critical' | 'warning' | 'healthy'>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [stats, setStats] = useState({
    total: 0,
    expired: 0,
    critical: 0,
    lowStockCount: 0,
    totalQuantity: 0,
    totalValuation: 0
  });
  const [traceItem, setTraceItem] = useState<InventoryItem | null>(null);
  const [traceData, setTraceData] = useState<TraceabilityItem[]>([]);
  const [loadingTrace, setLoadingTrace] = useState(false);

  // -- Kardex & Adjustment State
  const [kardexItem, setKardexItem] = useState<InventoryItem | null>(null);
  const [kardexData, setKardexData] = useState<KardexMovement[]>([]);
  const [loadingKardex, setLoadingKardex] = useState(false);
  
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustData, setAdjustData] = useState({ type: 'adjustment', qty: 1, obs: '' });
  const [savingAdjust, setSavingAdjust] = useState(false);

  // -- Reorder Settings State
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [reorderData, setReorderData] = useState({ min_stock: 20, lead_time_days: 45 });
  const [savingReorder, setSavingReorder] = useState(false);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [productTotals, setProductTotals] = useState<Record<string, number>>({});

  // -- Warehouse State
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [transferData, setTransferData] = useState({ to_warehouse_id: '', qty: 1, notes: '' });
  const [savingTransfer, setSavingTransfer] = useState(false);

  // -- Forecasting State
  const [forecastingList, setForecastingList] = useState<ForecastingItem[]>([]);
  const [showForecasting, setShowForecasting] = useState(false);
  const [loadingForecasting, setLoadingForecasting] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/inventory/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
        search: debouncedSearch,
        warehouseId: filterWarehouse === 'all' ? '' : filterWarehouse,
        status: filterStatus === 'all' ? '' : filterStatus
      });
      const res = await fetch(`${API}/inventory?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const result = await res.json();
        setItems(result.data);
        setTotalPages(result.meta.totalPages);
        setTotalItems(result.meta.total);
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
    }
    setLoading(false);
  };

  const fetchWarehouses = async () => {
    try {
      const res = await fetch(`${API}/inventory/warehouses`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setWarehouses(await res.json());
    } catch (err) {
      console.error('Error fetching warehouses:', err);
    }
  };

  const handleTrace = async (item: InventoryItem) => {
    setTraceItem(item);
    setLoadingTrace(true);
    try {
      const res = await fetch(`${API}/inventory/trace/${item.batch_id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setTraceData(await res.json());
    } catch (err) {
      console.error('Error fetching traceability:', err);
    }
    setLoadingTrace(false);
  };

  const notifyRecall = (customer: TraceabilityItem, product: string, batch: string) => {
    const text = `⚠️ *AVISO DE CALIDAD - IMPORTADORA* ⚠️\n\nHola *${customer.business_name || customer.customer_name}*,\n\nTe notificamos sobre un proceso de *RECALL / RETIRO* del producto: *${product}* (Lote: *${batch}*).\n\nPor favor separa las unidades restantes y contáctanos de inmediato para la reposición. ¡Gracias!`;
    window.open(`https://wa.me/${customer.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleKardex = async (item: InventoryItem) => {
    setKardexItem(item);
    setLoadingKardex(true);
    try {
      const res = await fetch(`${API}/inventory/${item.inventory_id}/kardex`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setKardexData(await res.json());
    } catch (err) {
      console.error('Error fetching kardex:', err);
    }
    setLoadingKardex(false);
  };

  const handleSaveAdjustment = async () => {
    if (!adjustItem) return;
    setSavingAdjust(true);
    try {
      const res = await fetch(`${API}/inventory/adjustment`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({
          inventory_id: adjustItem.inventory_id,
          batch_id: adjustItem.batch_id,
          movement_type: adjustData.type,
          quantity_change: Number(adjustData.qty),
          notes: adjustData.obs
        })
      });
      if (res.ok) {
        setAdjustItem(null);
        setAdjustData({ type: 'adjustment', qty: 1, obs: '' });
        fetchData();
      } else {
        alert('Error al guardar el ajuste. Verifique que no resulte en stock negativo.');
      }
    } catch (err) {
      console.error('Error saving adjustment:', err);
    }
    setSavingAdjust(false);
  };

  useEffect(() => { 
    fetchData(); 
  }, [currentPage, debouncedSearch, filterWarehouse, filterStatus]);

  useEffect(() => {
    fetchStats();
    fetchWarehouses();
  }, []);

  const getExpiryStatus = (dateStr: string) => {
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return { label: 'Caducado', color: '#dc2626', bg: '#fef2f2', class: 'expired' };
    if (diffDays <= 90) return { label: 'Crítico (<3m)', color: '#b91c1c', bg: '#fee2e2', class: 'critical' };
    if (diffDays <= 180) return { label: 'Próximo (<6m)', color: '#c2410c', bg: '#fff7ed', class: 'warning' };
    return { label: 'Saludable', color: '#15803d', bg: '#f0fdf4', class: 'healthy' };
  };

  // Local filtering is now handled server-side

  const handleSaveReorder = async () => {
    if (!reorderItem) return;
    setSavingReorder(true);
    try {
      const res = await fetch(`${API}/inventory/reorder-settings/${reorderItem.product_id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify(reorderData)
      });
      if (res.ok) {
        setReorderItem(null);
        fetchData();
      }
    } catch (err) {
      console.error('Error saving reorder settings:', err);
    }
    setSavingReorder(false);
  };

  const handleTransfer = async () => {
    if (!transferItem) return;
    setSavingTransfer(true);
    try {
      const res = await fetch(`${API}/inventory/transfer`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({
          from_inventory_id: transferItem.inventory_id,
          to_warehouse_id: transferData.to_warehouse_id,
          quantity: Number(transferData.qty),
          notes: transferData.notes
        })
      });
      if (res.ok) {
        setTransferItem(null);
        setTransferData({ to_warehouse_id: '', qty: 1, notes: '' });
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || 'Error en transferencia');
      }
    } catch (err) {
      console.error('Error transferring stock:', err);
    }
    setSavingTransfer(false);
  };

  const fetchForecasting = async () => {
    setShowForecasting(true);
    setLoadingForecasting(true);
    try {
      const res = await fetch(`${API}/inventory/forecasting`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setForecastingList(await res.json());
    } catch (err) {
      console.error('Error fetching forecasting:', err);
    }
    setLoadingForecasting(false);
  };

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />
      <div className="inventory-container">
        
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Control de Inventario y Caducidad</h1>
            <p className="subtitle">Gestión de lotes y trazabilidad sanitaria (ARCSA)</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-forecast" onClick={fetchForecasting}>
              📊 Planeación de Compra
            </button>
            <button className="btn-refresh" onClick={fetchData} disabled={loading}>
              <RefreshCw size={18} className={loading ? 'spin' : ''} /> Actualizar
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Package size={22} /></div>
            <div className="stat-body">
              <span className="stat-label">Total SKUs en Stock</span>
              <span className="stat-value">{stats.total}</span>
            </div>
          </div>
          <div className="stat-card urgent">
            <div className="stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><AlertTriangle size={22} /></div>
            <div className="stat-body">
              <span className="stat-label">Lotes Caducados</span>
              <span className="stat-value">{stats.expired}</span>
            </div>
          </div>
          <div className="stat-card critical" onClick={() => setShowLowStockOnly(!showLowStockOnly)} style={{ cursor: 'pointer', border: showLowStockOnly ? '2px solid #ea580c' : '1px solid var(--border)' }}>
            <div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}><Clock size={22} /></div>
            <div className="stat-body">
              <span className="stat-label">Bajo Stock (Reorden)</span>
              <span className="stat-value">{stats.lowStockCount}</span>
            </div>
            {showLowStockOnly && <Info size={14} style={{ marginLeft: 'auto', color: '#ea580c' }} />}
          </div>
          <div className="stat-card total">
            <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><CheckCircle size={22} /></div>
            <div className="stat-body">
              <span className="stat-label">Unidades Totales</span>
              <span className="stat-value">{stats.totalQuantity.toLocaleString('en-US')}</span>
            </div>
          </div>
          <div className="stat-card valuation">
            <div className="stat-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}><Bookmark size={22} /></div>
            <div className="stat-body">
              <span className="stat-label">Capital Invertido</span>
              <span className="stat-value">${stats.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="filters-bar">
          <div className="search-group">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar producto, SKU o lote..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-group" style={{ display: 'flex', gap: 12 }}>
            <div className="select-wrapper">
              <Navigation size={16} />
              <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)}>
                <option value="all">Todas las Bodegas</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="select-wrapper">
              <Filter size={16} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
                <option value="all">Todos los Estados</option>
                <option value="expired">🚨 Solo Caducados</option>
                <option value="critical">🔴 Críticos (3 meses)</option>
                <option value="warning">🟠 Próximos (6 meses)</option>
                <option value="healthy">🟢 Saludables</option>
              </select>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="table-card">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Producto / SKU</th>
                <th>Marca</th>
                <th>Lote</th>
                <th>Días Expiración</th>
                <th>Cant. Stock</th>
                <th>Valorización</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="info-cell">Cargando inventario...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="info-cell">No se encontraron productos con estos filtros.</td></tr>
              ) : (
                items.map(item => {
                  const status = getExpiryStatus(item.expiration_date);
                  return (
                    <tr key={item.inventory_id}>
                      <td>
                        <div className="product-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="p-name">{item.product_name}</span>
                          </div>
                          <span className="p-sku">{item.sku}</span>
                        </div>
                      </td>
                      <td><span className="brand-badge"><Bookmark size={10} /> {item.brand}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="batch-code">{item.batch_number}</span>
                          <button className="btn-trace" onClick={() => handleTrace(item)} title="Ver Trazabilidad (Clientes)">
                            <Search size={12} />
                          </button>
                          <button className="btn-trace kardex" onClick={() => handleKardex(item)} title="Ver Kardex (Historial)">
                            <BookOpen size={12} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="date-cell">
                          <Calendar size={14} />
                          {new Date(item.expiration_date).toLocaleDateString('es-EC', { year: 'numeric', month: 'short' })}
                        </div>
                      </td>
                      <td><strong>{item.quantity}</strong> <small>unds</small></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong>${(item.quantity * (Number(item.unit_cost) || 0)).toFixed(2)}</strong>
                          <small style={{ color: '#94a3b8', fontSize: '0.65rem' }}>c/u: ${Number(item.unit_cost).toFixed(2)}</small>
                        </div>
                      </td>
                      <td>
                        <div className="loc-cell">
                          <Navigation size={12} /> {item.warehouse_name || 'Sin Asignar'}
                          {item.bin_location && <small style={{ color: '#94a3b8' }}>({item.bin_location})</small>}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${status.class}`} style={{ color: status.color, background: status.bg }}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions-group">
                          <button className="btn-adjust" onClick={() => setAdjustItem(item)} title="Ajuste Manual">
                            <Edit3 size={14} /> Ajustar
                          </button>
                          <button className="btn-icon-tiny" onClick={() => { setReorderItem(item); setReorderData({ min_stock: item.min_stock, lead_time_days: item.lead_time_days }); }} title="Configurar Reorden">
                            <RefreshCw size={14} />
                          </button>
                          <button className="btn-icon-tiny" onClick={() => { setTransferItem(item); setTransferData({ to_warehouse_id: '', qty: 1, notes: '' }); }} title="Transferir a otra Bodega">
                            <Package size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          
          <div className="pagination-bar">
            <span className="pagination-info">Mostrando página {currentPage} de {totalPages} ({totalItems} registros totales)</span>
            <div className="pagination-controls">
              <button 
                className="btn-page"
                disabled={currentPage <= 1} 
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Anterior
              </button>
              <span className="current-page-badge">{currentPage}</span>
              <button 
                className="btn-page"
                disabled={currentPage >= totalPages} 
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>

        {/* Traceability Modal */}
        {traceItem && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTraceItem(null)}>
            <div className="modal-panel" style={{ maxWidth: '700px' }}>
              <div className="modal-header">
                <h2><Search size={20} /> Trazabilidad de Lote: {traceItem.batch_number}</h2>
                <button className="modal-close" onClick={() => setTraceItem(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="trace-info-header">
                  <Package size={16} /> <strong>{traceItem.product_name}</strong>
                  <span className="divider">|</span>
                  <Calendar size={16} /> Exp: {new Date(traceItem.expiration_date).toLocaleDateString()}
                </div>
                
                {loadingTrace ? (
                  <div className="loading-state"><RefreshCw size={24} className="spin" /></div>
                ) : traceData.length === 0 ? (
                  <div className="empty-state">
                    <h3>Sin movimientos de venta</h3>
                    <p>Este lote aún no ha sido entregado a ningún cliente.</p>
                  </div>
                ) : (
                  <div className="trace-list">
                    <p className="trace-count">Se encontraron {traceData.length} entregas asociadas:</p>
                    <table className="inventory-table small">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Venta #</th>
                          <th>Fecha</th>
                          <th>Cant.</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traceData.map((trace, idx) => (
                          <tr key={idx}>
                            <td>
                              <div className="customer-cell">
                                <strong>{trace.business_name || trace.customer_name}</strong>
                                <span>{trace.customer_phone}</span>
                              </div>
                            </td>
                            <td>{trace.sale_number}</td>
                            <td>{new Date(trace.sale_date).toLocaleDateString()}</td>
                            <td><strong>{trace.quantity_delivered}</strong></td>
                            <td>
                              <button 
                                className="btn-recall" 
                                onClick={() => notifyRecall(trace, traceItem.product_name, traceItem.batch_number)}
                                title="Notificar Recall via WhatsApp"
                              >
                                <MessageSquare size={14} /> Alertar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Kardex Modal */}
        {kardexItem && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setKardexItem(null)}>
            <div className="modal-panel" style={{ maxWidth: '800px' }}>
              <div className="modal-header">
                <h2><BookOpen size={20} /> Kardex: {kardexItem.product_name}</h2>
                <button className="modal-close" onClick={() => setKardexItem(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="trace-info-header">
                  <strong>Lote: {kardexItem.batch_number}</strong>
                  <span className="divider">|</span>
                  <span>Stock Actual: <strong>{kardexItem.quantity}</strong></span>
                </div>
                {loadingKardex ? (
                  <div className="loading-state"><RefreshCw size={24} className="spin" /></div>
                ) : (
                  <table className="inventory-table small">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Cantidad</th>
                        <th>Notas</th>
                        <th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kardexData.map(mv => (
                        <tr key={mv.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(mv.created_at).toLocaleString()}</td>
                          <td>
                            <span className={`mv-type ${mv.movement_type}`}>
                              {mv.movement_type === 'sale' && 'Salida Venta'}
                              {mv.movement_type === 'purchase' && 'Entrada Compra'}
                              {mv.movement_type === 'adjustment' && 'Ajuste Stock'}
                              {mv.movement_type === 'write_off' && 'Baja/Daño'}
                              {mv.movement_type === 'sample' && 'Muestra'}
                              {mv.movement_type === 'return' && 'Devolución'}
                            </span>
                          </td>
                          <td style={{ color: mv.quantity_change > 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                            {mv.quantity_change > 0 ? `+${mv.quantity_change}` : mv.quantity_change}
                          </td>
                          <td><small style={{ color: 'var(--muted-foreground)' }}>{mv.notes}</small></td>
                          <td><span className="user-span">{mv.user_name || 'Sistema'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Adjustment Modal */}
        {adjustItem && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAdjustItem(null)}>
            <div className="modal-panel" style={{ maxWidth: '450px' }}>
              <div className="modal-header">
                <h2><Edit3 size={20} /> Ajuste de Stock</h2>
                <button className="modal-close" onClick={() => setAdjustItem(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="adjust-form">
                  <div className="adjust-item-info">
                    <strong>{adjustItem.product_name}</strong>
                    <small>Lote: {adjustItem.batch_number} | Stock: {adjustItem.quantity}</small>
                  </div>
                  
                  <div className="form-group">
                    <label>Tipo de Ajuste</label>
                    <select value={adjustData.type} onChange={e => setAdjustData({...adjustData, type: e.target.value})}>
                      <option value="adjustment">Ajuste General (+/-)</option>
                      <option value="write_off">Baja por Daño (-)</option>
                      <option value="sample">Muestra / Tester (-)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Cantidad (use negativo para restar)</label>
                    <input 
                      type="number" 
                      value={adjustData.qty} 
                      onChange={e => setAdjustData({...adjustData, qty: Number(e.target.value)})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Observaciones / Motivo</label>
                    <textarea 
                      placeholder="Ej: Producto dañado en estantería..."
                      value={adjustData.obs}
                      onChange={e => setAdjustData({...adjustData, obs: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-refresh" onClick={() => setAdjustItem(null)}>Cancelar</button>
                <button className="btn-confirm" onClick={handleSaveAdjustment} disabled={savingAdjust}>
                  {savingAdjust ? <RefreshCw className="spin" size={16} /> : 'Guardar Ajuste'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reorder Settings Modal */}
        {reorderItem && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReorderItem(null)}>
            <div className="modal-panel" style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <h2><RefreshCw size={20} /> Configurar Reorden: {reorderItem.product_name}</h2>
                <button className="modal-close" onClick={() => setReorderItem(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="adjust-form">
                  <div className="form-group">
                    <label>Stock Mínimo (Alerta)</label>
                    <input 
                      type="number" 
                      value={reorderData.min_stock}
                      onChange={e => setReorderData({...reorderData, min_stock: Number(e.target.value)})}
                    />
                    <small>Se marcará como "REORDEN" si el stock total baja de este número.</small>
                  </div>
                  <div className="form-group">
                    <label>Tiempo de Importación (Días)</label>
                    <input 
                      type="number" 
                      value={reorderData.lead_time_days}
                      onChange={e => setReorderData({...reorderData, lead_time_days: Number(e.target.value)})}
                    />
                    <small>Días estimados que tarda el proveedor en entregar.</small>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-refresh" onClick={() => setReorderItem(null)}>Cancelar</button>
                <button className="btn-confirm" onClick={handleSaveReorder} disabled={savingReorder}>
                  {savingReorder ? <RefreshCw className="spin" size={16} /> : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Modal */}
        {transferItem && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTransferItem(null)}>
            <div className="modal-panel" style={{ maxWidth: '450px' }}>
              <div className="modal-header">
                <h2><Package size={20} /> Transferencia de Stock</h2>
                <button className="modal-close" onClick={() => setTransferItem(null)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="adjust-form">
                  <div className="adjust-item-info" style={{ borderLeftColor: '#f59e0b' }}>
                    <strong>{transferItem.product_name}</strong>
                    <small>Origen: {transferItem.warehouse_name} | Stock: {transferItem.quantity}</small>
                  </div>
                  
                  <div className="form-group">
                    <label>Bodega Destino</label>
                    <select 
                      value={transferData.to_warehouse_id} 
                      onChange={e => setTransferData({...transferData, to_warehouse_id: e.target.value})}
                    >
                      <option value="">Seleccione bodega...</option>
                      {warehouses.filter(w => w.id !== transferItem.warehouse_id).map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Cantidad a Transferir</label>
                    <input 
                      type="number" 
                      max={transferItem.quantity}
                      min={1}
                      value={transferData.qty} 
                      onChange={e => setTransferData({...transferData, qty: Number(e.target.value)})}
                    />
                  </div>

                  <div className="form-group">
                    <label>Notas (Opcional)</label>
                    <textarea 
                      placeholder="Motivo del movimiento..."
                      value={transferData.notes}
                      onChange={e => setTransferData({...transferData, notes: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-refresh" onClick={() => setTransferItem(null)}>Cancelar</button>
                <button className="btn-confirm" style={{ background: '#f59e0b' }} onClick={handleTransfer} disabled={savingTransfer || !transferData.to_warehouse_id}>
                  {savingTransfer ? <RefreshCw className="spin" size={16} /> : 'Ejecutar Transferencia'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Forecasting Modal */}
        {showForecasting && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForecasting(false)}>
            <div className="modal-panel" style={{ maxWidth: '900px' }}>
              <div className="modal-header">
                <h2>📊 Planeación Inteligente de Compra (Forecasting)</h2>
                <button className="modal-close" onClick={() => setShowForecasting(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 20, color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
                  Sugerencias basadas en el promedio de ventas diarias (ADS) de los últimos 30 días y el tiempo de importación configurado.
                </p>
                
                {loadingForecasting ? (
                  <div className="loading-state"><RefreshCw size={24} className="spin" /></div>
                ) : (
                  <table className="inventory-table small">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Venta Diaria (ADS)</th>
                        <th>Lead Time</th>
                        <th>Stock Actual</th>
                        <th>Días Restantes</th>
                        <th>Sugerencia Pedido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastingList.map(item => {
                        const safetyDays = 15;
                        const reorderPoint = item.ads * (item.lead_time_days + safetyDays);
                        const isUrgent = item.days_left <= (item.lead_time_days + safetyDays);
                        const suggestedToBuy = Math.max(0, Math.ceil((item.ads * 90) - item.current_stock)); // To cover 90 days

                        return (
                          <tr key={item.product_id} style={isUrgent ? { backgroundColor: '#fff7ed' } : {}}>
                            <td>
                              <div className="product-cell">
                                <span className="p-name">{item.product_name}</span>
                                <span className="p-sku">{item.sku}</span>
                              </div>
                            </td>
                            <td><strong>{Number(item.ads).toFixed(2)}</strong> <small>unid/día</small></td>
                            <td>{item.lead_time_days} días</td>
                            <td>{item.current_stock}</td>
                            <td>
                              <span style={{ 
                                color: isUrgent ? '#ea580c' : '#10b981', 
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}>
                                {isUrgent && <AlertTriangle size={14} />} {Math.floor(item.days_left)} días
                              </span>
                            </td>
                            <td>
                              {suggestedToBuy > 0 ? (
                                <span className="buy-suggestion">Pedir {suggestedToBuy} unds</span>
                              ) : (
                                <span style={{ color: 'var(--muted-foreground)' }}>Stock Suficiente</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn-refresh" onClick={() => setShowForecasting(false)}>Cerrar</button>
                <button className="btn-confirm" onClick={() => {
                  const text = "Sugerencias de Compra:\n" + forecastingList
                    .filter(i => (Math.max(0, Math.ceil((i.ads * 90) - i.current_stock))) > 0)
                    .map(i => `- ${i.product_name}: Pedir ${Math.ceil((i.ads * 90) - i.current_stock)} unidades`)
                    .join('\n');
                  navigator.clipboard.writeText(text);
                  alert('Sugerencias copiadas al portapapeles');
                }}>
                  📋 Copiar Sugerencias
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .inventory-container { padding: 32px; max-width: 1400px; margin: 0 auto; }
        
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .page-header h1 { font-size: 1.8rem; font-weight: 800; color: var(--foreground); margin: 0; }
        .subtitle { color: var(--muted-foreground); margin: 4px 0 0; font-size: 1rem; }

        .btn-refresh { background: var(--card); border: 1px solid var(--border); padding: 10px 16px; border-radius: 10px; font-weight: 700; color: var(--muted-foreground); cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
        .btn-refresh:hover { color: var(--foreground); border-color: var(--border); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
        .stat-card { background: var(--card); padding: 24px; border-radius: 16px; border: 1px solid var(--border); display: flex; gap: 16px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .stat-body { display: flex; flex-direction: column; }
        .stat-label { font-size: 0.8rem; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.025em; }
        .stat-value { font-size: 1.6rem; font-weight: 800; color: var(--foreground); }
        
        .stat-card.urgent { border-left: 4px solid #dc2626; }
        .stat-card.critical { border-left: 4px solid #ea580c; }
        .stat-card.valuation { border-left: 4px solid #7c3aed; }

        .filters-bar { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
        .search-group { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0 16px; display: flex; align-items: center; gap: 12px; height: 48px; }
        .search-group input { border: none; outline: none; width: 100%; font-size: 0.95rem; background: transparent; color: var(--foreground); }
        
        .select-wrapper { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 0 12px; height: 48px; min-width: 200px; }
        .select-wrapper select { border: none; outline: none; font-size: 0.9rem; font-weight: 600; color: var(--foreground); background: transparent; cursor: pointer; flex: 1; }

        .table-card { background: var(--card); border-radius: 16px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .inventory-table { width: 100%; border-collapse: collapse; text-align: left; }
        .inventory-table th { background: var(--background); padding: 16px; font-size: 0.75rem; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; border-bottom: 1px solid var(--border); }
        .inventory-table td { padding: 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        
        .product-cell { display: flex; flex-direction: column; }
        .p-name { font-weight: 700; color: var(--foreground); }
        .p-sku { font-size: 0.75rem; color: var(--muted-foreground); font-family: monospace; }
        
        .reorder-badge { background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; display: flex; align-items: center; gap: 4px; }

        .brand-badge { font-size: 0.75rem; font-weight: 600; color: var(--muted-foreground); background: var(--secondary); padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; width: fit-content; }
        .batch-code { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #2563eb; font-weight: 600; }
        
        .date-cell { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; color: var(--muted-foreground); }
        .loc-cell { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--muted-foreground); }

        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.025em; display: inline-block; }
        .status-badge.critical { animation: pulse 2s infinite; }
        
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
        }

        .info-cell { padding: 48px; text-align: center; color: var(--muted-foreground); font-weight: 600; }

        .pagination-bar { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: var(--card); border-top: 1px solid var(--border); }
        .pagination-info { font-size: 0.85rem; color: var(--muted-foreground); font-weight: 600; }
        .pagination-controls { display: flex; align-items: center; gap: 8px; }
        .btn-page { background: var(--background); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; color: var(--foreground); cursor: pointer; transition: 0.2s; }
        .btn-page:hover:not(:disabled) { background: var(--secondary); border-color: #2563eb; color: #2563eb; }
        .btn-page:disabled { opacity: 0.5; cursor: not-allowed; }
        .current-page-badge { background: #064035; color: white; padding: 6px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 800; }

        .btn-trace { background: var(--background); border: 1px solid var(--border); color: var(--muted-foreground); width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .btn-trace:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; transform: scale(1.1); }
        .btn-trace.kardex:hover { background: #fefce8; color: #a16207; border-color: #fef08a; }

        .trace-info-header { background: var(--background); padding: 12px 16px; border-radius: 10px; display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border: 1px solid var(--border); font-size: 0.9rem; }
        .divider { color: var(--border); }
        
        .trace-count { font-size: 0.85rem; color: var(--muted-foreground); margin-bottom: 12px; font-weight: 600; }
        
        .customer-cell { display: flex; flex-direction: column; }
        .customer-cell strong { color: var(--foreground); }
        .customer-cell span { font-size: 0.75rem; color: var(--muted-foreground); }
        
        .btn-recall { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: 0.2s; }
        .btn-recall:hover { background: #059669; color: white; transform: translateY(-1px); }

        .btn-adjust { background: var(--card); border: 1px solid var(--border); color: var(--foreground); padding: 6px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: 0.2s; }
        .btn-adjust:hover { border-color: #2563eb; color: #2563eb; background: #eff6ff; }

        .row-actions-group { display: flex; align-items: center; gap: 8px; }
        .btn-icon-tiny { background: var(--background); border: 1px solid var(--border); color: var(--muted-foreground); width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .btn-icon-tiny:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }

        .mv-type { padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
        .mv-type.sale { background: #fee2e2; color: #dc2626; }
        .mv-type.purchase { background: #dcfce7; color: #16a34a; }
        .mv-type.adjustment { background: #fef9c3; color: #a16207; }
        .mv-type.write_off { background: var(--secondary); color: var(--muted-foreground); border: 1px solid var(--border); }
        .mv-type.sample { background: #fae8ff; color: #a21caf; }
        .mv-type.return { background: #ecfdf5; color: #059669; }

        .user-span { font-size: 0.75rem; color: var(--muted-foreground); font-weight: 500; }

        .adjust-form { display: flex; flex-direction: column; gap: 20px; }
        .adjust-item-info { background: var(--background); padding: 12px; border-radius: 8px; border-left: 4px solid #2563eb; display: flex; flex-direction: column; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 0.85rem; font-weight: 700; color: var(--muted-foreground); }
        .form-group select, .form-group input, .form-group textarea { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); font-size: 0.95rem; outline: none; transition: 0.2s; }
        .form-group select:focus, .form-group input:focus, .form-group textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1); }
        .form-group textarea { min-height: 80px; resize: none; }

        .btn-confirm { background: var(--foreground); color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .btn-confirm:hover { background: var(--foreground); transform: translateY(-1px); }
        .btn-confirm:disabled { background: #94a3b8; cursor: not-allowed; }

        .btn-forecast { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 10px 16px; border-radius: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
        .btn-forecast:hover { background: #2563eb; color: white; transform: translateY(-1px); }

        .buy-suggestion { background: #ffedd5; color: #9a3412; padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem; border: 1px solid #fed7aa; }

        .inventory-table.small th, .inventory-table.small td { padding: 10px 12px; font-size: 0.85rem; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); border-radius: 16px; width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--background); }
        .modal-header h2 { font-size: 1.1rem; font-weight: 800; color: var(--foreground); margin: 0; display: flex; align-items: center; gap: 10px; }
        .modal-close { background: none; border: none; color: var(--muted-foreground); cursor: pointer; transition: 0.2s; }
        .modal-close:hover { color: #ef4444; transform: rotate(90deg); }
        .modal-body { padding: 24px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 12px; background: var(--background); }

        @media (max-width: 1024px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .filters-bar { flex-direction: column; }
        }
        @media (max-width: 768px) {
          .inventory-container { padding: 16px; }
          .page-header { flex-direction: column; gap: 16px; align-items: stretch; }
          .page-header > div:last-child { width: 100%; flex-direction: column; }
          .btn-forecast, .btn-refresh { width: 100%; justify-content: center; }
          .stats-grid { grid-template-columns: 1fr; gap: 12px; }
          .filter-group { flex-direction: column; width: 100%; }
          .select-wrapper { width: 100%; }
          .table-card { overflow-x: auto; }
          .inventory-table { min-width: 800px; }
          .modal-panel { width: 92%; max-height: 90vh; margin: 16px; }
          .modal-body { padding: 16px; }
          .modal-header { padding: 16px; }
          .modal-footer { padding: 16px; flex-direction: column; }
          .modal-footer button { width: 100%; }
        }
      `}</style>
    </div>
  );
}
