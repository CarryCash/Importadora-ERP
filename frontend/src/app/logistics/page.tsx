'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { Truck, MapPin, Package, Clock, ShieldCheck, TrendingUp, ArrowRight, Anchor, X, ClipboardList } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import LogisticsConfiguration from './LogisticsConfiguration';

export default function LogisticsPage({ initialView = 'operations' }: { initialView?: 'operations' | 'configuration' }) {
  const { user, token } = useAuth();
  const [containers, setContainers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    inTransit: 0, deliveredToday: 0, activeFleetPercent: 0, warehousePercent: 0, avgDeliveryTime: 0
  });

  // Modal states
  const [editingContainer, setEditingContainer] = useState<any>(null);
  const [assigningDelivery, setAssigningDelivery] = useState<any>(null);

  // Form states
  const [customsStatus, setCustomsStatus] = useState('');
  const [freeDaysDeadline, setFreeDaysDeadline] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const activeView = initialView;

  const isManager = user?.role === 'admin' || Boolean(user?.permissions?.includes('logistics.write'));

  const fetchData = () => {
    if (token) {
      fetch('/api/imports/containers/active', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setContainers(data); })
      .catch(err => console.error(err));

      fetch('/api/logistics/deliveries/upcoming', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setDeliveries(data); })
      .catch(err => console.error(err));

      fetch('/api/logistics/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => { if (data) setStats(data); })
      .catch(err => console.error(err));
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const updateDeliveryStatus = async (id: string, currentStatus: string) => {
    let nextStatus = 'En Ruta';
    if (currentStatus === 'En Cola') nextStatus = 'Preparando';
    else if (currentStatus === 'Preparando') nextStatus = 'En Ruta';
    else if (currentStatus === 'En Ruta') nextStatus = 'Entregado';

    try {
      const res = await fetch(`/api/logistics/deliveries/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setDeliveries(prev => prev.filter(d => d.id !== id || nextStatus !== 'Entregado').map(d => d.id === id ? { ...d, status: nextStatus } : d));
        fetchData(); // refresh stats
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitContainerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContainer) return;

    try {
      const res = await fetch(`/api/imports/containers/${editingContainer.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ customs_status: customsStatus, free_days_deadline: freeDaysDeadline })
      });
      if (res.ok) {
        setEditingContainer(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitDriverAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningDelivery) return;

    try {
      const res = await fetch(`/api/logistics/deliveries/${assigningDelivery.id}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ driver_name: driverName, vehicle_plate: vehiclePlate, scheduled_time: scheduledTime })
      });
      if (res.ok) {
        setAssigningDelivery(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="logistics-layout">
      <Navbar />
      
      <main className="logistics-content">
        <div className="container">
          <div className="header-section">
            <div>
              <h1 className="title">Módulo de Logística</h1>
              <p className="subtitle">Gestión de rutas, despachos y aduanas</p>
            </div>
            <div className="header-stats">
              <div className="mini-stat">
                <span className="stat-label">En Tránsito (Flota)</span>
                <span className="stat-value">{stats.inTransit}</span>
              </div>
              <div className="stat-divider" />
              <div className="mini-stat">
                <span className="stat-label">Entregados Hoy</span>
                <span className="stat-value">{stats.deliveredToday}</span>
              </div>
            </div>
          </div>

          {activeView === 'operations' ? <>
          <div className="hero-grid">
            <div className="main-card glass-card">
              <div className="card-header">
                <div className="icon-box blue">
                  <Truck size={18} />
                </div>
                <h3>Estado de Operaciones</h3>
              </div>
              <div className="operations-grid">
                <div className="op-item">
                  <span className="op-label">Flota Activa</span>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${stats.activeFleetPercent}%` }}></div>
                  </div>
                  <span className="op-val">{stats.activeFleetPercent}%</span>
                </div>
                <div className="op-item">
                  <span className="op-label">Capacidad de Bodega</span>
                  <div className="progress-bar">
                    <div className="progress-fill warning" style={{ width: `${stats.warehousePercent}%` }}></div>
                  </div>
                  <span className="op-val">{stats.warehousePercent}%</span>
                </div>
              </div>
              <button className="action-btn">Ver Reporte Detallado <ArrowRight size={16} /></button>
            </div>

            <div className="side-cards">
              <div className="mini-card glass-card">
                <div className="mini-card-icon green">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4>Entregas Seguras</h4>
                  <p>99.8% efectividad este mes</p>
                </div>
              </div>
              <div className="mini-card glass-card">
                <div className="mini-card-icon purple">
                  <Clock size={20} />
                </div>
                <div>
                  <h4>Tiempo Promedio</h4>
                  <p>{stats.avgDeliveryTime} días por despacho</p>
                </div>
              </div>
            </div>
          </div>

          <div className="containers-section mb-8">
            <div className="glass-card full-width-card">
              <div className="card-header">
                <div className="icon-box green">
                  <Anchor size={24} />
                </div>
                <h3>Estado de Contenedores y Puerto (SENAE)</h3>
              </div>
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Contenedor / BL</th>
                      <th>Puerto</th>
                      <th>Estado Aduanero</th>
                      <th>Días Libres (Sobrestadía)</th>
                      {isManager && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {containers.length === 0 && (
                      <tr><td colSpan={isManager ? 5 : 4} className="text-center py-8 text-gray-500">No hay contenedores activos</td></tr>
                    )}
                    {containers.map(c => {
                      const daysLeft = Math.ceil((new Date(c.free_days_deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                      const isCritical = daysLeft <= 1 || c.customs_status === 'Aforo Físico';
                      return (
                        <tr key={c.id} className={isCritical ? 'bg-red-50' : ''}>
                          <td>
                            <div className="font-bold text-gray-900">{c.container_number} <span className="text-xs text-gray-500 font-normal">({c.container_type})</span></div>
                            <div className="text-sm text-gray-600">{c.bl_number}</div>
                          </td>
                          <td className="font-medium text-gray-700">{c.port_name}</td>
                          <td>
                            <span className={`badge ${c.customs_status === 'Aforo Físico' ? 'badge-danger' : c.customs_status === 'Levante Autorizado' ? 'badge-success' : 'badge-warning'}`}>
                              {c.customs_status}
                            </span>
                          </td>
                          <td>
                            <div className={daysLeft < 0 ? 'text-red-600 font-bold' : 'font-medium'}>
                              {new Date(c.free_days_deadline).toLocaleDateString()}
                            </div>
                            <div className="text-xs">
                              {daysLeft < 0 ? `Vencido hace ${Math.abs(daysLeft)} días` : `Faltan ${daysLeft} días`}
                            </div>
                          </td>
                          {isManager && (
                            <td>
                              <button 
                                className="btn-secondary-mini"
                                onClick={() => {
                                  setCustomsStatus(c.customs_status);
                                  // Format date to YYYY-MM-DD for input type="date"
                                  const dateStr = new Date(c.free_days_deadline).toISOString().split('T')[0];
                                  setFreeDaysDeadline(dateStr);
                                  setEditingContainer(c);
                                }}
                              >
                                Editar Datos
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="info-grid">
            <div className="list-card glass-card">
              <h3>Próximos Despachos</h3>
              <div className="despacho-list">
                {deliveries.length === 0 ? (
                  <p className="text-gray-500 text-sm">No hay despachos programados por ahora.</p>
                ) : (
                  deliveries.map(d => {
                    const scheduledTime = new Date(d.scheduled_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const scheduledDate = new Date(d.scheduled_time).toLocaleDateString();
                    return (
                      <div key={d.id} className="despacho-item">
                        <div className="d-info" style={{ flex: 1 }}>
                          <span className="d-id">{d.delivery_number} <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>({d.sale_number})</span></span>
                          <span className="d-dest">{d.delivery_address || 'Dirección no especificada'}</span>
                          <span style={{fontSize: '0.7rem', color: '#64748b', marginTop: '4px'}}>Chofer: {d.driver_name || 'No Asignado'} | Placa: {d.vehicle_plate || 'N/A'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span className={`d-status ${d.status === 'En Ruta' ? 'active' : d.status === 'Preparando' ? 'warning' : ''}`}>{d.status}</span>
                            <span className="d-time">{scheduledTime}</span>
                          </div>
                          
                          {isManager && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => {
                                setDriverName(d.driver_name || '');
                                setVehiclePlate(d.vehicle_plate || '');
                                // Format datetime to datetime-local format
                                const dtStr = new Date(d.scheduled_time).toISOString().slice(0,16);
                                setScheduledTime(dtStr);
                                setAssigningDelivery(d);
                              }} className="btn-outline-mini">
                                Asignar Chofer
                              </button>
                              <button onClick={() => updateDeliveryStatus(d.id, d.status)} className="btn-secondary-mini">
                                {d.status === 'En Cola' ? 'Preparar' : d.status === 'Preparando' ? 'Despachar' : 'Marcar Entregado'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="map-placeholder glass-card">
              <div className="placeholder-content">
                <MapPin size={48} className="map-icon" />
                <h3>Mapa de Rastreo</h3>
                <p>Módulo de geolocalización en desarrollo</p>
              </div>
            </div>
          </div>
          </> : <LogisticsConfiguration />}
        </div>
      </main>

      {/* MODAL: EDIT CONTAINER */}
      {editingContainer && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Editar Contenedor: {editingContainer.container_number}</h3>
              <button onClick={() => setEditingContainer(null)} className="btn-close"><X size={20} /></button>
            </div>
            <form onSubmit={submitContainerEdit} className="modal-body">
              <div className="form-group">
                <label>Estado Aduanero</label>
                <select value={customsStatus} onChange={(e) => setCustomsStatus(e.target.value)} required className="form-input">
                  <option value="En Tránsito">En Tránsito</option>
                  <option value="Aforo Físico">Aforo Físico</option>
                  <option value="Aforo Automático">Aforo Automático</option>
                  <option value="Levante Autorizado">Levante Autorizado</option>
                  <option value="Retirado">Retirado</option>
                </select>
              </div>
              <div className="form-group">
                <label>Fecha Límite (Días Libres)</label>
                <input type="date" value={freeDaysDeadline} onChange={(e) => setFreeDaysDeadline(e.target.value)} required className="form-input" />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-primary">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN DRIVER */}
      {assigningDelivery && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Asignar Ruta: {assigningDelivery.delivery_number}</h3>
              <button onClick={() => setAssigningDelivery(null)} className="btn-close"><X size={20} /></button>
            </div>
            <form onSubmit={submitDriverAssign} className="modal-body">
              <div className="form-group">
                <label>Nombre del Chofer</label>
                <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Ej. Juan Perez" required className="form-input" />
              </div>
              <div className="form-group">
                <label>Placa del Vehículo</label>
                <input type="text" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="Ej. GBA-1234" required className="form-input" />
              </div>
              <div className="form-group">
                <label>Hora Programada</label>
                <input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} required className="form-input" />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-primary">Confirmar Asignación</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .logistics-layout {
          min-height: 100vh;
          background: var(--background);
        }
        .logistics-content {
          padding: 40px 0;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
        }
        .title {
          font-size: 2.25rem;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.025em;
        }
        .subtitle {
          color: var(--muted-foreground);
          font-size: 1.1rem;
          margin-top: 4px;
        }
        .header-stats {
          display: flex;
          gap: 32px;
          background: var(--card);
          padding: 16px 32px;
          border-radius: 20px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        .mini-stat {
          display: flex;
          flex-direction: column;
        }
        .stat-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--foreground);
        }
        .stat-divider {
          width: 1px;
          background: var(--border);
        }
        .hero-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        .glass-card {
          background: var(--card);
          border-radius: 32px;
          padding: 32px;
          border: 1px solid var(--border);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }
        .icon-box {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-box.blue { background: var(--accent); color: var(--accent-foreground); }
        .card-header h3 { font-size: 1.25rem; font-weight: 700; color: var(--foreground); }
        
        .operations-grid {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-bottom: 32px;
        }
        .op-item {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .op-label { width: 140px; font-size: 0.9rem; font-weight: 600; color: var(--muted-foreground); }
        .progress-bar { flex: 1; height: 12px; background: var(--secondary); border-radius: 6px; overflow: hidden; }
        .progress-fill { height: 100%; background: #3b82f6; border-radius: 6px; }
        .progress-fill.warning { background: #f59e0b; }
        .op-val { width: 40px; font-size: 0.9rem; font-weight: 700; color: var(--foreground); }

        .action-btn {
          width: 100%;
          padding: 14px;
          background: var(--action-color, var(--primary));
          color: var(--primary-foreground);
          border: none;
          border-radius: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.2s;
        }
        .action-btn:hover { filter: brightness(.92); transform: translateY(-1px); }

        .side-cards {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .mini-card {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 24px;
        }
        .mini-card-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mini-card-icon.green, .mini-card-icon.purple { background: var(--accent); color: var(--accent-foreground); }
        .mini-card h4 { font-size: 1rem; font-weight: 700; color: var(--foreground); margin: 0; }
        .mini-card p { font-size: 0.85rem; color: var(--muted-foreground); margin: 4px 0 0; }

        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1.5fr;
          gap: 24px;
        }
        .list-card h3 { margin-bottom: 24px; font-size: 1.1rem; }
        .despacho-list { display: flex; flex-direction: column; gap: 16px; }
        .despacho-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--background);
          border-radius: 12px;
        }
        .d-info { display: flex; flex-direction: column; }
        .d-id { font-size: 0.85rem; font-weight: 700; color: var(--foreground); }
        .d-dest { font-size: 0.75rem; color: var(--muted-foreground); }
        .d-status { font-size: 0.7rem; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: var(--border); color: var(--muted-foreground); }
        .d-status.active { background: #dcfce7; color: #15803d; }
        .d-status.warning { background: #fef3c7; color: #d97706; }
        .d-time { font-size: 0.85rem; font-weight: 600; color: var(--foreground); }

        .map-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          background: var(--background);
          border: 2px dashed var(--border);
        }
        .placeholder-content { text-align: center; color: #94a3b8; }
        .map-icon { margin-bottom: 16px; opacity: 0.5; }
        .placeholder-content h3 { color: var(--muted-foreground); margin-bottom: 8px; }

        .mb-8 { margin-bottom: 2rem; }
        .full-width-card { width: 100%; }
        .table-responsive { overflow-x: auto; }
        .premium-table { width: 100%; border-collapse: collapse; text-align: left; }
        .premium-table th { padding: 16px 32px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--muted-foreground); background: var(--secondary); border-bottom: 1px solid var(--border); }
        .premium-table td { padding: 16px 32px; font-size: 0.9rem; color: var(--foreground); border-bottom: 1px solid var(--border); }
        .font-bold { font-weight: 700; }
        .font-medium { font-weight: 500; }
        .font-normal { font-weight: 400; }
        .text-sm { font-size: 0.875rem; }
        .text-xs { font-size: 0.75rem; }
        .text-gray-900 { color: #111827; }
        .text-gray-700 { color: #374151; }
        .text-gray-600 { color: #4b5563; }
        .text-gray-500 { color: #6b7280; }
        .text-red-600 { color: #dc2626; }
        .text-center { text-align: center; }
        .py-8 { padding-top: 2rem; padding-bottom: 2rem; }
        .bg-red-50 { background-color: #fef2f2; }
        
        .badge { padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; }
        .badge-danger { background: #fee2e2; color: #dc2626; }
        .badge-warning { background: #fef3c7; color: #d97706; }
        .badge-success { background: #dcfce7; color: #15803d; }
        .icon-box.green { background: var(--accent); color: var(--accent-foreground); }
        
        .btn-secondary-mini {
          background: var(--secondary);
          color: var(--foreground);
          border: 1px solid var(--border);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-secondary-mini:hover { background: var(--border); }

        .btn-outline-mini {
          background: transparent;
          color: #3b82f6;
          border: 1px solid #bfdbfe;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-outline-mini:hover { background: #eff6ff; }

        /* Modals */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: var(--card);
          padding: 24px;
          border-radius: 16px;
          width: 400px;
          max-width: 90%;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .modal-header h3 { font-size: 1.25rem; font-weight: 700; margin: 0; }
        .btn-close { background: none; border: none; cursor: pointer; color: var(--muted-foreground); }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; color: var(--foreground); }
        .form-input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
          font-family: inherit;
        }
        .modal-footer {
          margin-top: 24px;
          display: flex;
          justify-content: flex-end;
        }
        .btn-primary {
          background: #3b82f6;
          color: white;
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-primary:hover { background: #2563eb; }
      `}</style>
    </div>
  );
}
