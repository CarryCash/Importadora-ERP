'use client';

import React, { useState, useEffect } from 'react';
import { Warehouse as WarehouseIcon, MapPin, RefreshCw, ArrowRight } from 'lucide-react';

const API = '/api';

export default function StorageHierarchyView() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [tab, setTab] = useState<'warehouses' | 'locations'>('warehouses');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [whRes, locRes] = await Promise.all([
        fetch(`${API}/inventory/warehouses`),
        fetch(`${API}/storage/locations`),
      ]);
      if (whRes.ok) setWarehouses(await whRes.json());
      if (locRes.ok) setLocations(await locRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredLocations =
    selectedWarehouseId === 'all'
      ? locations
      : locations.filter((loc) => loc.warehouse_id === selectedWarehouseId);

  return (
    <div className="storage-hierarchy-view">
      {/* Sub Header & Tabs */}
      <div className="sub-header-bar">
        <div>
          <h3>Almacenamiento y Jerarquía Física</h3>
          <p className="subtitle">
            Estructura física multinivel: Empresa → Sucursal → Bodega → Zona → Pasillo → Estantería → Nivel → Posición
          </p>
        </div>

        <div className="sub-actions">
          <div className="sub-nav-bar">
            <button
              onClick={() => setTab('warehouses')}
              className={`sub-tab-btn ${tab === 'warehouses' ? 'active' : ''}`}
            >
              Bodegas ({warehouses.length})
            </button>
            <button
              onClick={() => setTab('locations')}
              className={`sub-tab-btn ${tab === 'locations' ? 'active' : ''}`}
            >
              Ubicaciones ({locations.length})
            </button>
          </div>

          <button className="btn-icon" onClick={fetchData} title="Actualizar">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* VISTA BODEGAS */}
      {tab === 'warehouses' && (
        <div className="warehouses-grid">
          {warehouses.map((wh) => {
            const isRestricted = ['transito', 'cuarentena', 'danada', 'devoluciones'].includes(
              wh.operating_type || wh.type,
            );
            return (
              <div key={wh.id} className="warehouse-card">
                <div>
                  <div className="wh-header">
                    <span className="wh-code">{wh.code}</span>
                    <span className={`status-pill ${isRestricted ? 'restricted' : 'active'}`}>
                      {wh.operating_type || wh.type || 'Principal'}
                    </span>
                  </div>

                  <h4>{wh.name}</h4>
                  <p className="wh-desc">{wh.description || 'Bodega operativa de la empresa.'}</p>

                  <div className="wh-meta">
                    <div className="meta-row">
                      <span>Política Comercial:</span>
                      <strong style={{ color: isRestricted ? '#ea580c' : '#059669' }}>
                        {isRestricted ? 'Restringida (Sin venta directa)' : 'Habilitada para despacho'}
                      </strong>
                    </div>
                    <div className="meta-row">
                      <span>Ubicaciones configuradas:</span>
                      <strong>{locations.filter((l) => l.warehouse_id === wh.id).length} posiciones</strong>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedWarehouseId(wh.id);
                    setTab('locations');
                  }}
                  className="wh-action-btn"
                >
                  Ver Posiciones Físicas <ArrowRight size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA UBICACIONES */}
      {tab === 'locations' && (
        <div>
          <div className="filters-bar" style={{ marginBottom: 16 }}>
            <div className="filter-group">
              <label style={{ fontSize: '0.82rem', fontWeight: 600, alignSelf: 'center' }}>
                Filtrar por Bodega:
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="filter-select"
              >
                <option value="all">Todas las Bodegas</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código Normalizado</th>
                  <th>Bodega</th>
                  <th>Zona / Área</th>
                  <th>Coordenadas (Pas-Est-Niv-Pos)</th>
                  <th>Tipo Posición</th>
                  <th style={{ textAlign: 'center' }}>Ocupación</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocations.map((loc) => {
                  const occupancy = Number(loc.units_occupancy_percent || 0);
                  return (
                    <tr key={loc.id} className="table-row">
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{loc.code}</td>
                      <td>
                        <strong>{loc.warehouse_name || 'Almacén'}</strong>
                      </td>
                      <td>{loc.zone || 'Sin zona'}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>
                        {loc.aisle || '-'}-{loc.rack || '-'}-{loc.level || '-'}-{loc.position || '-'}
                      </td>
                      <td>
                        <span className="type-tag">{loc.location_type || 'Almacenamiento'}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="progress-wrap">
                          <div className="progress-bar">
                            <div
                              className={`progress-fill ${
                                occupancy > 90 ? 'critical' : occupancy > 60 ? 'warning' : 'ok'
                              }`}
                              style={{ width: `${Math.min(100, occupancy)}%` }}
                            />
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700 }}>
                            {occupancy}%
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`status-pill ${loc.status === 'active' ? 'active' : 'restricted'}`}>
                          {loc.status || 'Activa'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredLocations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-state-cell">
                      Sin ubicaciones registradas para el filtro seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style jsx>{`
        .storage-hierarchy-view {
          color: var(--foreground);
        }
        .sub-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border);
          margin-bottom: 20px;
          padding-bottom: 14px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .sub-header-bar h3 {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0;
          color: var(--foreground);
        }
        .subtitle {
          font-size: 0.85rem;
          color: var(--muted-foreground);
          margin-top: 3px;
        }

        .sub-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sub-nav-bar {
          display: flex;
          gap: 8px;
        }
        .sub-tab-btn {
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

        /* Cuadrícula de Bodegas */
        .warehouses-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .warehouse-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          transition: border-color 0.15s;
        }
        .warehouse-card:hover {
          border-color: #cbd5e1;
        }
        .wh-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .wh-code {
          font-family: monospace;
          font-size: 0.75rem;
          font-weight: 700;
          background: var(--secondary);
          padding: 2px 8px;
          border-radius: 6px;
        }
        .warehouse-card h4 {
          font-size: 1.05rem;
          font-weight: 800;
          margin: 0 0 6px;
          color: var(--foreground);
        }
        .wh-desc {
          font-size: 0.8rem;
          color: var(--muted-foreground);
          margin: 0 0 16px;
          line-height: 1.4;
        }
        .wh-meta {
          border-top: 1px solid var(--border);
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.78rem;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
        }
        .meta-row span {
          color: var(--muted-foreground);
        }
        .wh-action-btn {
          margin-top: 16px;
          width: 100%;
          padding: 9px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: 0.15s;
        }
        .wh-action-btn:hover {
          background: var(--card);
          border-color: #064035;
          color: #064035;
        }

        /* Tabla de Ubicaciones */
        .filters-bar {
          display: flex;
          align-items: center;
        }
        .filter-group {
          display: flex;
          gap: 8px;
        }
        .filter-select {
          padding: 0 12px;
          height: 38px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.85rem;
          outline: none;
          background: var(--card);
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

        .type-tag {
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--secondary);
          color: var(--muted-foreground);
        }
        .progress-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .progress-bar {
          width: 60px;
          height: 6px;
          border-radius: 3px;
          background: var(--secondary);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 3px;
        }
        .progress-fill.ok {
          background: #059669;
        }
        .progress-fill.warning {
          background: #d97706;
        }
        .progress-fill.critical {
          background: #dc2626;
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
        .status-pill.restricted {
          background: #fff7ed;
          color: #ea580c;
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

        @media (max-width: 1024px) {
          .warehouses-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 680px) {
          .warehouses-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
