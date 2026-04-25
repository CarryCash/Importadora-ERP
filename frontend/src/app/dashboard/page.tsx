'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Navbar from '../../components/Navbar';
import QuickStatsBanner from '../../components/dashboard/QuickStatsBanner';
import UpcomingImportsWidget from '../../components/dashboard/UpcomingImportsWidget';
import WeeklyFlowChartWidget from '../../components/dashboard/WeeklyFlowChartWidget';
import RoleBasedQuickActions from '../../components/dashboard/RoleBasedQuickActions';
import PortAlertsWidget from '../../components/dashboard/PortAlertsWidget';
import {
  Truck,
  Ship,
  Package,
  DollarSign,
  Calendar,
  ChevronRight
} from 'lucide-react';


interface DashboardData {
  totalRevenue: number;
  salesToday: number;
  criticalBatches: any[];
  lowStockProducts: any[];
  inTransitImports: number;
  pendingOrders: number;
  upcomingImports?: any[];
  weeklyFlow?: any[];
}

export default function DashboardPage() {
  const { user, token, isLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) {
      router.push('/login');
    }
  }, [token, isLoading, router]);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const fetchData = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/reports/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        setError('Error al cargar datos del sistema');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    }
  };

  if (isLoading || !token) {
    return <div className="loading-screen">Verificando sesión...</div>;
  }

  const hasQuickStatsPermission = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'sales';

  return (
    <div className="dashboard-wrapper">
      <Navbar />

      <main className="dashboard-main">
        <div className="content-inner">
          <div className="dashboard-header-row">
            <div>
              <h1 className="page-title">Panel de Control</h1>
              <p className="page-subtitle">Bienvenido de nuevo, <span className="user-highlight">{user?.username}</span></p>
            </div>
            <div className="header-date">
              <Calendar size={18} />
              {new Date().toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          {/* Quick Stats Banner */}
          {hasQuickStatsPermission && data && (
            <QuickStatsBanner 
              inTransitImports={data.inTransitImports || 0}
              pendingOrders={data.pendingOrders || 0}
              salesToday={data.salesToday || 0}
              totalRevenue={data.totalRevenue || 0}
            />
          )}

          {/* KPI GRID REMOVED BY USER REQUEST */}

          <div className="dashboard-main-grid">
            <div className="left-column">
              {/* Conditional Quick Actions */}
              <RoleBasedQuickActions />

              {/* Widget: Upcoming Imports */}
              {hasQuickStatsPermission && data?.upcomingImports && (
                <UpcomingImportsWidget imports={data.upcomingImports} />
              )}

              {/* Alert: Expiration Batches */}
              <div className="card table-card-premium">
                <div className="card-header-premium">
                  <div>
                    <h3>⏰ Lotes Próximos a Vencer</h3>
                    <p className="card-desc">Acciones preventivas para productos con menos de 90 días</p>
                  </div>
                  <button className="btn-view-all" onClick={() => router.push('/inventory')}>
                    Ver Inventario <ChevronRight size={16} />
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Lote #</th>
                        <th>Vencimiento</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.criticalBatches.length === 0 && (
                        <tr><td colSpan={4} className="empty-cell">No hay lotes críticos actualmente.</td></tr>
                      )}
                      {data?.criticalBatches.map((batch: any) => {
                        const daysLeft = Math.ceil((new Date(batch.expiration_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                        return (
                          <tr key={batch.id}>
                            <td className="font-semibold">{batch.product_name}</td>
                            <td><code className="batch-code">{batch.batch_number}</code></td>
                            <td>{new Date(batch.expiration_date).toLocaleDateString()}</td>
                            <td>
                              <span className={`badge ${daysLeft < 30 ? 'badge-danger' : 'badge-warning'}`}>
                                {daysLeft <= 0 ? 'Caducado' : `${daysLeft} días`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="right-column">
              {/* Port Alerts Widget */}
              {hasQuickStatsPermission && (
                <PortAlertsWidget />
              )}

              {/* Widget: Chart */}
              {hasQuickStatsPermission && data?.weeklyFlow && (
                <WeeklyFlowChartWidget data={data.weeklyFlow} />
              )}

              {/* Card: Reabastecimiento Crítico */}
              <div className="card table-card-premium">
                <div className="card-header-premium">
                  <div>
                    <h3>📦 Stock Crítico</h3>
                    <p className="card-desc">Productos que requieren reposición inmediata</p>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Existencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.lowStockProducts.length === 0 && (
                        <tr><td colSpan={2} className="empty-cell">Todo el stock está saludable.</td></tr>
                      )}
                      {data?.lowStockProducts.map((prod: any) => (
                        <tr key={prod.name}>
                          <td className="font-medium">{prod.name}</td>
                          <td>
                            <div className="stock-level-cell">
                              <span className="stock-count">{prod.total_quantity}</span>
                              <div className="mini-progress-bar">
                                <div className="progress-fill" style={{ width: `${(prod.total_quantity / 50) * 100}%` }}></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main> 

      <style jsx>{`
        .dashboard-wrapper {
          min-height: 100vh;
          background: var(--background);
          display: flex;
          flex-direction: column;
        }

        .dashboard-main {
          flex: 1;
          padding: 32px 0;
        }

        .content-inner {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 40px;
        }

        .dashboard-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 32px;
        }

        .page-title {
          font-size: 2rem;
          font-weight: 800;
          color: var(--foreground);
          margin-bottom: 4px;
        }

        .page-subtitle {
          color: var(--muted-foreground);
          font-size: 1rem;
        }

        .user-highlight {
          color: #064035;
          font-weight: 700;
        }

        .header-date {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--card);
          padding: 8px 16px;
          border-radius: 12px;
          border: 1px solid var(--border);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--muted-foreground);
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        /* KPI GRID STYLES REMOVED */

        /* MAIN GRID */
        .dashboard-main-grid {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 24px;
        }

        .left-column, .right-column {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .table-card-premium {
          background: var(--card);
          border-radius: 24px;
          border: 1px solid var(--border);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        .card-header-premium {
          padding: 24px 32px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-header-premium h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--foreground);
          margin-bottom: 4px;
        }

        .card-desc {
          font-size: 0.85rem;
          color: #94a3b8;
          margin: 0;
        }

        .btn-view-all {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          font-weight: 700;
          color: #064035;
          background: #f0fdf4;
          padding: 8px 16px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: 0.2s;
        }

        .btn-view-all:hover {
          background: #dcfce7;
          transform: translateX(4px);
        }

        .table-responsive {
          overflow-x: auto;
        }

        .premium-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .premium-table th {
          padding: 16px 32px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--muted-foreground);
          background: var(--secondary);
          border-bottom: 1px solid var(--border);
        }

        .premium-table td {
          padding: 16px 32px;
          font-size: 0.9rem;
          color: var(--foreground);
          border-bottom: 1px solid var(--border);
        }

        .batch-code {
          background: var(--secondary);
          padding: 2px 8px;
          border-radius: 4px;
          font-family: monospace;
          font-weight: 600;
        }

        .badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .badge-danger { background: #fee2e2; color: #dc2626; }
        .badge-warning { background: #fff7ed; color: #ea580c; }

        .empty-cell {
          text-align: center;
          padding: 40px !important;
          color: #94a3b8;
          font-style: italic;
        }

        /* STOCK LEVELS */
        .stock-level-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .stock-count {
          font-weight: 800;
          color: var(--foreground);
          min-width: 30px;
        }

        .mini-progress-bar {
          flex: 1;
          height: 6px;
          background: var(--secondary);
          border-radius: 3px;
          overflow: hidden;
          min-width: 60px;
        }

        .progress-fill {
          height: 100%;
          background: #ef4444;
          border-radius: 3px;
        }

        /* QUICK ACTIONS */
        .quick-actions-card {
          padding: 24px 32px;
          background: var(--card);
          border-radius: 24px;
          border: 1px solid var(--border);
        }

        .quick-actions-card h3 {
          font-size: 1.1rem;
          font-weight: 800;
          margin-bottom: 20px;
          color: var(--foreground);
        }

        .actions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 16px;
          color: var(--muted-foreground);
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: #064035;
          color: white;
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(6, 64, 53, 0.2);
        }

        .action-btn span {
          font-size: 0.8rem;
          font-weight: 700;
        }

        .loading-screen {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          font-family: 'Inter', sans-serif;
          background: var(--background);
          color: #064035;
          font-weight: 600;
        }

        .full-width-card {
          width: 100%;
        }

        .header-flex {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .count-badge {
          background: #fff7ed;
          color: #c2410c;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          border: 1px solid #ffedd5;
        }

        .user-profile-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .avatar-letter {
          width: 28px;
          height: 28px;
          background: var(--secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.75rem;
          color: var(--muted-foreground);
        }

        .text-success { color: #10b981; }
        .text-danger { color: #ef4444; }
        .quote-id-text { color: #3b82f6; font-weight: 700; }
        .font-extrabold { font-weight: 800; }
        
        .mini-action-btn {
          background: #f0f9ff;
          color: #0369a1;
          border: 1px solid #bae6fd;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }

        .mini-action-btn:hover {
          background: #0369a1;
          color: white;
        }

        @media (max-width: 1024px) {
          .dashboard-main-grid { grid-template-columns: 1fr; }
          .content-inner { padding: 0 24px; }
        }
      `}</style>
    </div>
  );
}
