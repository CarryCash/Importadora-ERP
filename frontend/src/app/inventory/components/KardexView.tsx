'use client';

import React, { useState, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';

const API = '/api';

export default function KardexView() {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const fetchKardex = async () => {
    setLoading(true);
    try {
      const [storageMovsRes, whRes] = await Promise.all([
        fetch(`${API}/storage/movements`),
        fetch(`${API}/inventory/warehouses`),
      ]);
      if (storageMovsRes.ok) setMovements(await storageMovsRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKardex();
  }, []);

  const filteredMovements = movements.filter((m) => {
    const matchesSearch =
      !searchTerm ||
      m.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.batch_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesWarehouse = warehouseFilter === 'all' || m.warehouse_id === warehouseFilter;
    return matchesSearch && matchesWarehouse;
  });

  return (
    <div className="kardex-view">
      {/* Search and Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por producto, SKU o lote..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">Todas las Bodegas</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>

          <button className="btn-icon" onClick={fetchKardex} title="Actualizar">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Movements Table */}
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha y Hora</th>
              <th>Producto</th>
              <th>Operación</th>
              <th>Ruta (Origen → Destino)</th>
              <th>Lote / Serie</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {filteredMovements.map((m) => (
              <tr key={m.id} className="table-row">
                <td>
                  <span className="sub-text">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </td>
                <td>
                  <strong>{m.product_name}</strong>
                  <span className="sub-text">{m.sku}</span>
                </td>
                <td>
                  <span className="op-tag">{m.movement_type}</span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                  {m.from_location_code || 'Exterior'} → {m.to_location_code || 'Exterior'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {m.batch_number || 'N/A'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                  {m.quantity}
                </td>
                <td>
                  <span className="sub-text">{m.created_by_name || 'Sistema'}</span>
                </td>
              </tr>
            ))}
            {filteredMovements.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state-cell">
                  No se encontraron movimientos históricos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .kardex-view {
          color: var(--foreground);
        }

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
          align-items: center;
          gap: 10px;
        }
        .filter-select {
          padding: 0 12px;
          height: 42px;
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.85rem;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }

        .btn-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
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
        .op-tag {
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 6px;
          background: var(--secondary);
          color: var(--foreground);
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
      `}</style>
    </div>
  );
}
