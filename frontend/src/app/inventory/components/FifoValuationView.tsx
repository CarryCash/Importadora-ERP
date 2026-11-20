'use client';

import React, { useState, useEffect } from 'react';
import { Layers, DollarSign, Package, RefreshCw } from 'lucide-react';

const API = '/api';

export default function FifoValuationView() {
  const [layers, setLayers] = useState<any[]>([]);
  const [valuationData, setValuationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'active' | 'exhausted' | 'all'>('active');
  const [selectedSubTab, setSelectedSubTab] = useState<'valuation' | 'layers'>('valuation');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [layersRes, valRes] = await Promise.all([
        fetch(`${API}/inventory/cost-layers?status=${statusFilter}`),
        fetch(`${API}/inventory/valuation`),
      ]);
      if (layersRes.ok) setLayers(await layersRes.json());
      if (valRes.ok) setValuationData(await valRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  return (
    <div className="fifo-valuation-view">
      {/* Top Valuation KPIs (stats-grid estándar ERP) */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
            <DollarSign size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Valoración Total Inventario</span>
            <span className="stat-value" style={{ color: '#059669' }}>
              ${valuationData?.summary?.totalValuation?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Package size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Unidades Valorizadas</span>
            <span className="stat-value">
              {valuationData?.summary?.totalUnits?.toLocaleString('en-US') || '0'}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>
            <Layers size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Capas FIFO Activas</span>
            <span className="stat-value" style={{ color: '#7c3aed' }}>
              {layers.filter((l) => l.status === 'active').length}
            </span>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="sub-header-bar">
        <div className="sub-nav-bar">
          <button
            onClick={() => setSelectedSubTab('valuation')}
            className={`sub-tab-btn ${selectedSubTab === 'valuation' ? 'active' : ''}`}
          >
            Valoración por Producto
          </button>
          <button
            onClick={() => setSelectedSubTab('layers')}
            className={`sub-tab-btn ${selectedSubTab === 'layers' ? 'active' : ''}`}
          >
            Detalle de Capas FIFO
          </button>
        </div>

        <div className="sub-actions">
          {selectedSubTab === 'layers' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="filter-select"
            >
              <option value="active">Capas Activas</option>
              <option value="exhausted">Capas Agotadas</option>
              <option value="all">Todas las Capas</option>
            </select>
          )}
          <button className="btn-icon" onClick={fetchData} title="Actualizar">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Vista 1: Valoración por Producto */}
      {selectedSubTab === 'valuation' && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th style={{ textAlign: 'center' }}>Capas Activas</th>
                <th style={{ textAlign: 'right' }}>Unidades Restantes</th>
                <th style={{ textAlign: 'right' }}>Costo Promedio FIFO</th>
                <th style={{ textAlign: 'right', color: '#059669' }}>Valoración Total USD</th>
              </tr>
            </thead>
            <tbody>
              {valuationData?.products?.map((p: any) => (
                <tr key={p.product_id} className="table-row">
                  <td>
                    <strong>{p.product_name}</strong>
                  </td>
                  <td>
                    <span className="sub-text" style={{ fontFamily: 'monospace' }}>{p.sku}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="layers-tag">{p.active_layers_count}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                    {Number(p.total_remaining_quantity).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                    ${Number(p.average_fifo_unit_cost).toFixed(4)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#059669' }}>
                    ${Number(p.total_valuation).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {(!valuationData?.products || valuationData.products.length === 0) && (
                <tr>
                  <td colSpan={6} className="empty-state-cell">
                    Sin datos de valoración disponibles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Vista 2: Detalle de Capas FIFO */}
      {selectedSubTab === 'layers' && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha Efectiva</th>
                <th>Producto</th>
                <th>Origen</th>
                <th style={{ textAlign: 'right' }}>Cant. Inicial</th>
                <th style={{ textAlign: 'right', color: '#059669' }}>Cant. Restante</th>
                <th style={{ textAlign: 'right' }}>Costo Unitario USD</th>
                <th style={{ textAlign: 'right' }}>Saldo Valorizado</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((l: any) => (
                <tr key={l.id} className="table-row">
                  <td>
                    <span className="sub-text">
                      {new Date(l.effective_date).toLocaleDateString()}
                    </span>
                  </td>
                  <td>
                    <strong>{l.product_name}</strong>
                    <span className="sub-text">{l.sku}</span>
                  </td>
                  <td>
                    <span className="origin-tag">{l.origin_doc_type}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{l.initial_quantity}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                    {l.remaining_quantity}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                    ${Number(l.functional_unit_cost).toFixed(4)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                    ${(Number(l.remaining_quantity) * Number(l.functional_unit_cost)).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`status-pill ${l.status === 'active' ? 'active' : 'exhausted'}`}>
                      {l.status === 'active' ? 'Activa' : 'Agotada'}
                    </span>
                  </td>
                </tr>
              ))}
              {layers.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state-cell">
                    No se encontraron capas FIFO con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .fifo-valuation-view {
          color: var(--foreground);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
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
          font-size: 1.45rem;
          font-weight: 800;
          color: var(--foreground);
        }

        .sub-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          margin-bottom: 18px;
          padding-bottom: 12px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .sub-nav-bar {
          display: flex;
          gap: 10px;
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

        .sub-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .filter-select {
          padding: 0 12px;
          height: 36px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.82rem;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }
        .btn-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--muted-foreground);
          cursor: pointer;
          transition: 0.15s;
        }
        .btn-icon:hover {
          background: var(--background);
          color: var(--foreground);
        }

        /* Tabla */
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

        .sub-text {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          display: block;
        }
        .layers-tag {
          font-family: monospace;
          font-size: 0.78rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--secondary);
          color: var(--foreground);
        }
        .origin-tag {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--secondary);
          color: var(--muted-foreground);
        }
        .status-pill {
          display: inline-block;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 12px;
        }
        .status-pill.active {
          background: #ecfdf5;
          color: #059669;
        }
        .status-pill.exhausted {
          background: var(--secondary);
          color: var(--muted-foreground);
        }

        .empty-state-cell {
          padding: 40px;
          text-align: center;
          color: var(--muted-foreground);
          font-size: 0.88rem;
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

        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
