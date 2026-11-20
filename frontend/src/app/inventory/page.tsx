'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  X,
  BarChart3,
  ClipboardList,
  Layers,
  Warehouse as WarehouseIcon,
  Sliders,
  DollarSign,
  Eye,
  Plus,
  ArrowRight,
} from 'lucide-react';
import Product360Modal from './components/Product360Modal';
import FifoValuationView from './components/FifoValuationView';
import StorageHierarchyView from './components/StorageHierarchyView';
import KardexView from './components/KardexView';
import OperationsView from './components/OperationsView';
import InventoryCountsWizard from './components/InventoryCountsWizard';

interface InventoryItem {
  balance_id?: string;
  inventory_id?: string;
  quantity?: number;
  physical_stock?: number;
  reserved_stock?: number;
  blocked_stock?: number;
  available_stock?: number;
  in_transit_stock?: number;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: string;
  bin_location?: string;
  location_code?: string;
  batch_number?: string;
  lot_number?: string;
  expiration_date?: string;
  product_name: string;
  sku: string;
  brand?: string;
  batch_id?: string;
  lot_id?: string;
  product_id: string;
  min_stock?: number;
  lead_time_days?: number;
  unit_cost?: number;
  unit_cost_fifo?: number;
  tracking_type?: string;
}

interface Warehouse {
  id: string;
  name: string;
  code: string;
  type: string;
  operating_type?: string;
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

const API = '/api';

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InventoryPage() {
  const [activeGroup, setActiveGroup] = useState<
    'general_control' | 'storage' | 'operations' | 'traceability_valuation'
  >('general_control');

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'expired' | 'critical' | 'warning' | 'healthy'>('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [stats, setStats] = useState({
    total: 0,
    expired: 0,
    critical: 0,
    lowStockCount: 0,
    totalQuantity: 0,
    totalReserved: 0,
    totalBlocked: 0,
    totalAvailable: 0,
    totalValuation: 0,
  });

  const [selectedProduct360Id, setSelectedProduct360Id] = useState<string | null>(null);

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustData, setAdjustData] = useState({ type: 'adjustment', qty: 1, obs: '' });
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [transferData, setTransferData] = useState({ to_warehouse_id: '', qty: 1, notes: '' });
  const [savingTransfer, setSavingTransfer] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [forecastingList, setForecastingList] = useState<ForecastingItem[]>([]);
  const [showForecasting, setShowForecasting] = useState(false);
  const [loadingForecasting, setLoadingForecasting] = useState(false);

  const [operationsSubTab, setOperationsSubTab] = useState<'overview' | 'counts'>('overview');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/inventory/stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await fetch(`${API}/inventory/warehouses`);
      if (res.ok) setWarehouses(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: '25',
        search: debouncedSearch,
        warehouseId: filterWarehouse,
        status: filterStatus,
      });

      const res = await fetch(`${API}/inventory/balances?${query.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setItems(result.data || []);
        setTotalPages(result.meta?.totalPages || 1);
        setTotalItems(result.meta?.total || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (activeGroup === 'general_control') {
      fetchBalances();
    }
  }, [currentPage, debouncedSearch, filterWarehouse, filterStatus, activeGroup]);

  const handleSaveAdjustment = async () => {
    if (!adjustItem) return;
    setSavingAdjust(true);
    try {
      const res = await fetch(`${API}/inventory/adjustment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_id: adjustItem.inventory_id || adjustItem.balance_id,
          batch_id: adjustItem.batch_id || adjustItem.lot_id,
          movement_type: adjustData.type,
          quantity_change: Number(adjustData.qty),
          notes: adjustData.obs,
        }),
      });
      if (res.ok) {
        setAdjustItem(null);
        fetchBalances();
        fetchStats();
      } else {
        const err = await res.json();
        alert(`Error al ajustar: ${err.message || 'Error desconocido'}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleSaveTransfer = async () => {
    if (!transferItem || !transferData.to_warehouse_id) return;
    setSavingTransfer(true);
    try {
      const res = await fetch(`${API}/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_inventory_id: transferItem.inventory_id || transferItem.balance_id,
          to_warehouse_id: transferData.to_warehouse_id,
          quantity: Number(transferData.qty),
          notes: transferData.notes,
        }),
      });
      if (res.ok) {
        setTransferItem(null);
        fetchBalances();
        fetchStats();
      } else {
        const err = await res.json();
        alert(`Error al transferir: ${err.message || 'Error'}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleOpenForecasting = async () => {
    setShowForecasting(true);
    setLoadingForecasting(true);
    try {
      const res = await fetch(`${API}/inventory/forecasting`);
      if (res.ok) {
        setForecastingList(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingForecasting(false);
    }
  };

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />

      <div className="inventory-page">
        {/* Header Principal con el estilo estándar del ERP */}
        <div className="page-header">
          <div>
            <h1>Módulo de Inventario</h1>
            <p className="page-subtitle">
              Control multinivel de existencias · Valoración FIFO auditada · Auditoría física y trazabilidad inmutable
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={handleOpenForecasting}>
              <BarChart3 size={16} /> Pronóstico ADS
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                fetchStats();
                if (activeGroup === 'general_control') fetchBalances();
              }}
              title="Actualizar datos"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setActiveGroup('operations');
                setOperationsSubTab('counts');
              }}
            >
              <Plus size={18} /> Nuevo Conteo
            </button>
          </div>
        </div>

        {/* Pestañas de Navegación de los 4 Grupos */}
        <div className="inventory-nav-tabs">
          <button
            onClick={() => setActiveGroup('general_control')}
            className={`nav-tab ${activeGroup === 'general_control' ? 'active' : ''}`}
          >
            <Package size={16} /> 1. Control General
          </button>
          <button
            onClick={() => setActiveGroup('storage')}
            className={`nav-tab ${activeGroup === 'storage' ? 'active' : ''}`}
          >
            <WarehouseIcon size={16} /> 2. Almacenamiento
          </button>
          <button
            onClick={() => setActiveGroup('operations')}
            className={`nav-tab ${activeGroup === 'operations' ? 'active' : ''}`}
          >
            <Sliders size={16} /> 3. Operaciones y Conteos
          </button>
          <button
            onClick={() => setActiveGroup('traceability_valuation')}
            className={`nav-tab ${activeGroup === 'traceability_valuation' ? 'active' : ''}`}
          >
            <Layers size={16} /> 4. Trazabilidad y Valoración
          </button>
        </div>

        {/* ========================================================================= */}
        {/* GRUPO 1: CONTROL GENERAL */}
        {/* ========================================================================= */}
        {activeGroup === 'general_control' && (
          <>
            {/* Tarjetas KPI de Control General (stats-grid) */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                  <Package size={20} />
                </div>
                <div className="stat-info">
                  <span className="stat-label">Físico Total</span>
                  <span className="stat-value">{stats.totalQuantity.toLocaleString()}</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <CheckCircle size={20} />
                </div>
                <div className="stat-info">
                  <span className="stat-label">Disponible Venta</span>
                  <span className="stat-value">{stats.totalAvailable.toLocaleString()}</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
                  <Clock size={20} />
                </div>
                <div className="stat-info">
                  <span className="stat-label">Reservado Comercial</span>
                  <span className="stat-value">{stats.totalReserved.toLocaleString()}</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                  <AlertTriangle size={20} />
                </div>
                <div className="stat-info">
                  <span className="stat-label">Bloqueado / Cuarentena</span>
                  <span className="stat-value">{stats.totalBlocked.toLocaleString()}</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>
                  <DollarSign size={20} />
                </div>
                <div className="stat-info">
                  <span className="stat-label">Valoración FIFO USD</span>
                  <span className="stat-value">{fmt(stats.totalValuation)}</span>
                </div>
              </div>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="filters-bar">
              <div className="search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar por producto, SKU, lote o código de ubicación..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <select value={filterWarehouse} onChange={(e) => setFilterWarehouse(e.target.value)}>
                  <option value="all">Todas las Bodegas</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>

                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
                  <option value="all">Todos los Estados</option>
                  <option value="critical">Crítico (Vence en 90d)</option>
                  <option value="expired">Vencidos</option>
                  <option value="healthy">Saludables</option>
                </select>
              </div>
            </div>

            {/* Tabla de Existencias */}
            <div className="table-card">
              {loading ? (
                <div className="loading-state">
                  <RefreshCw size={24} className="spin" />
                  <span>Cargando existencias...</span>
                </div>
              ) : items.length === 0 ? (
                <div className="empty-state">
                  <Package size={48} />
                  <h3>Sin existencias</h3>
                  <p>No se encontraron productos para los filtros seleccionados.</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Producto & SKU</th>
                      <th>Bodega & Ubicación</th>
                      <th>Lote / Serie</th>
                      <th style={{ textAlign: 'right' }}>Físico</th>
                      <th style={{ textAlign: 'right' }}>Reservado</th>
                      <th style={{ textAlign: 'right', color: '#059669' }}>Disponible</th>
                      <th style={{ textAlign: 'right' }}>Costo FIFO</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const physical = Number(item.physical_stock ?? item.quantity ?? 0);
                      const reserved = Number(item.reserved_stock ?? 0);
                      const blocked = Number(item.blocked_stock ?? 0);
                      const available = Number(item.available_stock ?? Math.max(0, physical - reserved - blocked));

                      return (
                        <tr key={item.balance_id || idx} className="table-row">
                          <td>
                            <div className="product-cell">
                              <strong>{item.product_name}</strong>
                              <span className="sub-text">{item.sku}</span>
                            </div>
                          </td>
                          <td>
                            <div className="location-cell">
                              <span>{item.warehouse_name}</span>
                              <span className="sub-text">
                                {item.location_code || item.bin_location || 'Sin ubicación'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="lot-tag">{item.lot_number || item.batch_number || 'General'}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{physical}</td>
                          <td style={{ textAlign: 'right', color: '#ea580c', fontWeight: 600 }}>{reserved}</td>
                          <td style={{ textAlign: 'right', color: '#059669', fontWeight: 800 }}>{available}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                            ${Number(item.unit_cost_fifo ?? item.unit_cost ?? 0).toFixed(4)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="row-actions" style={{ justifyContent: 'center' }}>
                              <button
                                className="btn-icon"
                                onClick={() => setSelectedProduct360Id(item.product_id)}
                                title="Ver Ficha 360°"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => {
                                  setAdjustItem(item);
                                  setAdjustData({ type: 'adjustment', qty: 1, obs: '' });
                                }}
                                title="Ajuste auditado"
                              >
                                <Sliders size={15} />
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => {
                                  setTransferItem(item);
                                  setTransferData({ to_warehouse_id: '', qty: 1, notes: '' });
                                }}
                                title="Transferir entre bodegas"
                              >
                                <RefreshCw size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Barra de Paginación */}
              <div className="pagination-bar">
                <span>Total de registros: {totalItems}</span>
                <div>
                  <button
                    className="btn-secondary"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Anterior
                  </button>
                  <span style={{ alignSelf: 'center', fontWeight: 600 }}>
                    Página {currentPage} de {totalPages || 1}
                  </span>
                  <button
                    className="btn-secondary"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* GRUPO 2: ALMACENAMIENTO */}
        {/* ========================================================================= */}
        {activeGroup === 'storage' && <StorageHierarchyView />}

        {/* ========================================================================= */}
        {/* GRUPO 3: OPERACIONES Y CONTEOS */}
        {/* ========================================================================= */}
        {activeGroup === 'operations' && (
          <div className="operations-section">
            <div className="sub-nav-bar">
              <button
                onClick={() => setOperationsSubTab('overview')}
                className={`sub-tab-btn ${operationsSubTab === 'overview' ? 'active' : ''}`}
              >
                Panel de Operaciones & Salidas
              </button>
              <button
                onClick={() => setOperationsSubTab('counts')}
                className={`sub-tab-btn ${operationsSubTab === 'counts' ? 'active' : ''}`}
              >
                <ClipboardList size={14} />
                Conteos Físicos & Congelamiento
              </button>
            </div>

            {operationsSubTab === 'overview' ? (
              <OperationsView
                onOpenTransferModal={() => {
                  if (items.length > 0) {
                    setTransferItem(items[0]);
                    setTransferData({ to_warehouse_id: '', qty: 1, notes: '' });
                  }
                }}
                onOpenAdjustModal={() => {
                  if (items.length > 0) {
                    setAdjustItem(items[0]);
                    setAdjustData({ type: 'adjustment', qty: 1, obs: '' });
                  }
                }}
                onOpenForecastModal={handleOpenForecasting}
                onOpenCounts={() => setOperationsSubTab('counts')}
              />
            ) : (
              <InventoryCountsWizard
                onCountReconciled={() => {
                  fetchBalances();
                  fetchStats();
                }}
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* GRUPO 4: TRAZABILIDAD Y VALORACIÓN */}
        {/* ========================================================================= */}
        {activeGroup === 'traceability_valuation' && (
          <div className="valuation-section">
            <FifoValuationView />
            <div style={{ marginTop: 32 }}>
              <div className="section-title">
                <Layers size={18} /> Kardex General Inmutable
              </div>
              <KardexView />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL FICHA 360° DEL PRODUCTO */}
        {/* ========================================================================= */}
        {selectedProduct360Id && (
          <Product360Modal
            productId={selectedProduct360Id}
            onClose={() => setSelectedProduct360Id(null)}
          />
        )}

        {/* ========================================================================= */}
        {/* MODAL AJUSTE DE INVENTARIO */}
        {/* ========================================================================= */}
        {adjustItem && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && setAdjustItem(null)}
          >
            <div className="modal-panel" style={{ maxWidth: 540 }}>
              <div className="modal-header">
                <h2>
                  <Sliders size={20} /> Ajuste de Inventario
                </h2>
                <button className="modal-close" onClick={() => setAdjustItem(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <div style={{ marginBottom: 16 }}>
                  <strong>{adjustItem.product_name}</strong>
                  <span className="sub-text">
                    SKU: {adjustItem.sku} · Stock Físico: {adjustItem.physical_stock ?? adjustItem.quantity}
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Tipo de Ajuste</label>
                  <select
                    value={adjustData.type}
                    onChange={(e) => setAdjustData({ ...adjustData, type: e.target.value })}
                  >
                    <option value="adjustment">Corrección Físico-Contable</option>
                    <option value="write_off">Baja por Daño / Pérdida</option>
                    <option value="sample">Muestra Comercial</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Cambio de Cantidad (+ o -)</label>
                  <input
                    type="number"
                    value={adjustData.qty}
                    onChange={(e) => setAdjustData({ ...adjustData, qty: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Justificación Obligatoria para Auditoría</label>
                  <textarea
                    value={adjustData.obs}
                    onChange={(e) => setAdjustData({ ...adjustData, obs: e.target.value })}
                    placeholder="Explique el motivo del ajuste para auditoría contable..."
                    style={{
                      padding: 10,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      minHeight: 80,
                    }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setAdjustItem(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-confirm"
                  disabled={savingAdjust || !adjustData.obs.trim()}
                  onClick={handleSaveAdjustment}
                >
                  {savingAdjust ? 'Aplicando...' : 'Confirmar Ajuste'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL TRANSFERENCIA ENTRE BODEGAS */}
        {/* ========================================================================= */}
        {transferItem && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && setTransferItem(null)}
          >
            <div className="modal-panel" style={{ maxWidth: 540 }}>
              <div className="modal-header">
                <h2>
                  <RefreshCw size={20} /> Transferencia entre Bodegas
                </h2>
                <button className="modal-close" onClick={() => setTransferItem(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <div style={{ marginBottom: 16 }}>
                  <strong>{transferItem.product_name}</strong>
                  <span className="sub-text">
                    Bodega Origen: {transferItem.warehouse_name} · Disponible:{' '}
                    {transferItem.available_stock ?? transferItem.quantity}
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Bodega Destino</label>
                  <select
                    value={transferData.to_warehouse_id}
                    onChange={(e) => setTransferData({ ...transferData, to_warehouse_id: e.target.value })}
                  >
                    <option value="">Seleccione bodega destino...</option>
                    {warehouses
                      .filter((w) => w.id !== transferItem.warehouse_id)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label>Cantidad a Transferir</label>
                  <input
                    type="number"
                    min="1"
                    max={transferItem.available_stock ?? transferItem.quantity}
                    value={transferData.qty}
                    onChange={(e) => setTransferData({ ...transferData, qty: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label>Notas del Traslado / Guía de Remisión</label>
                  <input
                    type="text"
                    placeholder="Motivo o número de guía..."
                    value={transferData.notes}
                    onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setTransferItem(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-confirm"
                  disabled={savingTransfer || !transferData.to_warehouse_id || transferData.qty <= 0}
                  onClick={handleSaveTransfer}
                >
                  {savingTransfer ? 'Procesando...' : 'Iniciar Traslado'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL PRONÓSTICO & FORECASTING */}
        {/* ========================================================================= */}
        {showForecasting && (
          <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && setShowForecasting(false)}
          >
            <div className="modal-panel" style={{ maxWidth: 840 }}>
              <div className="modal-header">
                <h2>
                  <BarChart3 size={20} /> Pronóstico de Agotamiento y ADS (Venta Diaria)
                </h2>
                <button className="modal-close" onClick={() => setShowForecasting(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                {loadingForecasting ? (
                  <div className="loading-state">
                    <RefreshCw size={24} className="spin" />
                    <span>Calculando pronósticos de consumo...</span>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'right' }}>Stock Actual</th>
                        <th style={{ textAlign: 'right' }}>Venta 30d</th>
                        <th style={{ textAlign: 'right' }}>ADS (Venta/Día)</th>
                        <th style={{ textAlign: 'right' }}>Días Restantes</th>
                        <th style={{ textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastingList.map((f) => (
                        <tr key={f.product_id} className="table-row">
                          <td>
                            <strong>{f.product_name}</strong>
                            <span className="sub-text">{f.sku}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{f.current_stock}</td>
                          <td style={{ textAlign: 'right' }}>{f.total_sold_30d}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {Number(f.ads).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>
                            {f.days_left >= 999 ? '∞' : Math.round(f.days_left)} días
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className={`status-badge ${
                                f.days_left <= f.lead_time_days
                                  ? 'critical'
                                  : f.days_left <= f.lead_time_days * 1.5
                                  ? 'warning'
                                  : 'healthy'
                              }`}
                            >
                              {f.days_left <= f.lead_time_days
                                ? 'Reorden Urgente'
                                : f.days_left <= f.lead_time_days * 1.5
                                ? 'Atención'
                                : 'Óptimo'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowForecasting(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .inventory-page {
          padding: 32px;
          max-width: 1400px;
          margin: 0 auto;
          color: var(--foreground);
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 24px;
        }
        .header-actions {
          display: flex;
          flex: 0 0 auto;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
        }
        .header-actions > button {
          min-height: 44px;
          justify-content: center;
          white-space: nowrap;
        }
        .page-header h1 {
          font-size: 1.8rem;
          font-weight: 800;
          margin: 0;
          color: var(--foreground);
        }
        .page-subtitle {
          color: var(--muted-foreground);
          font-size: 0.95rem;
          margin-top: 4px;
        }

        /* Barra de Pestañas de Navegación */
        .inventory-nav-tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 24px;
          overflow-x: auto;
        }
        .nav-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 18px;
          border: none;
          background: transparent;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--muted-foreground);
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: 0.15s;
          white-space: nowrap;
        }
        .nav-tab:hover {
          color: var(--foreground);
        }
        .nav-tab.active {
          color: #064035;
          border-bottom-color: #064035;
        }

        .sub-nav-bar {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .sub-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--muted-foreground);
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: 0.15s;
        }
        .sub-tab-btn.active {
          background: #064035;
          color: white;
          border-color: #064035;
        }

        /* Métricas KPI */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: var(--card);
          padding: 18px;
          border-radius: 12px;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--muted-foreground);
          display: block;
        }
        .stat-value {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--foreground);
        }

        /* Filtros */
        .filters-bar {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          align-items: center;
          flex-wrap: wrap;
        }
        .search-box {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0 14px;
          height: 42px;
          min-width: 280px;
        }
        .search-box input {
          border: none;
          outline: none;
          width: 100%;
          font-size: 0.9rem;
          background: transparent;
          color: var(--foreground);
        }
        .filter-group {
          display: flex;
          gap: 10px;
        }
        .filter-group select {
          padding: 0 12px;
          height: 42px;
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.85rem;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }

        /* Tablas */
        .table-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow-x: auto;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th {
          background: var(--background);
          padding: 12px 16px;
          text-align: left;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--muted-foreground);
          border-bottom: 1px solid var(--border);
          font-weight: 700;
        }
        .table-row td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 0.88rem;
        }
        .table-row:hover td {
          background: var(--background);
        }

        .product-cell strong {
          display: block;
          font-size: 0.9rem;
          color: var(--foreground);
        }
        .sub-text {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          display: block;
          margin-top: 2px;
        }
        .location-cell span {
          display: block;
          font-weight: 600;
        }
        .lot-tag {
          font-family: monospace;
          font-size: 0.78rem;
          background: var(--secondary);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .status-badge {
          display: inline-block;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 12px;
        }
        .status-badge.critical {
          background: #fee2e2;
          color: #dc2626;
        }
        .status-badge.warning {
          background: #fef3c7;
          color: #d97706;
        }
        .status-badge.healthy {
          background: #d1fae5;
          color: #059669;
        }

        .row-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }
        .btn-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--muted-foreground);
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-icon:hover {
          background: var(--background);
          color: var(--foreground);
        }

        /* Botones estándar ERP */
        .btn-primary {
          background: #064035;
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.2s;
        }
        .btn-primary:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .btn-confirm {
          background: #064035;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.15s;
        }
        .btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--foreground);
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.15s;
        }
        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-secondary:hover:not(:disabled) {
          background: var(--background);
        }

        /* Estados vacíos y de carga */
        .empty-state {
          min-height: 240px;
          padding: 40px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--foreground);
        }
        .empty-state > svg {
          width: 28px;
          height: 28px;
          padding: 14px;
          border-radius: 16px;
          background: var(--secondary);
          color: #064035;
        }
        .empty-state h3 {
          margin: 16px 0 5px;
          color: var(--foreground);
          font-size: 1.1rem;
          font-weight: 750;
        }
        .empty-state p {
          margin: 0;
          max-width: 360px;
          color: var(--muted-foreground);
          font-size: 0.9rem;
        }
        .loading-state {
          padding: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--muted-foreground);
          font-size: 0.9rem;
        }
        .pagination-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          color: var(--muted-foreground);
          font-size: 0.85rem;
          border-top: 1px solid var(--border);
        }
        .pagination-bar > div {
          display: flex;
          gap: 8px;
        }

        /* Modales */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .modal-panel {
          background: var(--card);
          border-radius: 16px;
          width: 100%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        .modal-header {
          padding: 18px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--background);
        }
        .modal-header h2 {
          font-size: 1.1rem;
          font-weight: 800;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--foreground);
        }
        .modal-close {
          border: none;
          background: transparent;
          color: var(--muted-foreground);
          cursor: pointer;
        }
        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        .modal-footer {
          padding: 16px 24px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: var(--background);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--muted-foreground);
          text-transform: uppercase;
        }
        .form-group input,
        .form-group select {
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.9rem;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }
        .section-title {
          font-size: 0.9rem;
          font-weight: 800;
          color: var(--foreground);
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 680px) {
          .inventory-page {
            padding: 16px;
          }
          .page-header {
            flex-direction: column;
            align-items: stretch;
          }
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .filters-bar {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}
