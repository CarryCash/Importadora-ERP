'use client';

import React, { useEffect, useState } from 'react';
import { Ship, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function PortAlertsWidget() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (token) {
      fetch('http://localhost:3000/api/imports/containers/alerts', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlerts(data);
        }
      })
      .catch(err => console.error("Error fetching port alerts:", err));
    }
  }, [token]);

  if (alerts.length === 0) return null;

  return (
    <div className="card table-card-premium">
      <div className="card-header-premium">
        <div>
          <h3 className="flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Alertas de Puerto</h3>
          <p className="card-desc">Contenedores en riesgo de sobrestadía o en aforo físico</p>
        </div>
        <button className="btn-view-all" onClick={() => router.push('/logistics')}>
          Ver Logística <ChevronRight size={16} />
        </button>
      </div>
      <div className="table-responsive">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Contenedor</th>
              <th>BL / Naviera</th>
              <th>Estado Ecuapass</th>
              <th>Límite Libres</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert: any) => {
              const daysLeft = Math.ceil((new Date(alert.free_days_deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
              const isCritical = daysLeft <= 1 || alert.customs_status === 'Aforo Físico';
              
              return (
                <tr key={alert.id} className={isCritical ? 'bg-red-50' : ''}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Ship size={16} className={isCritical ? 'text-red-500' : 'text-orange-500'} />
                      <span className="font-semibold">{alert.container_number}</span>
                      <span className="text-xs text-gray-500">({alert.container_type})</span>
                    </div>
                  </td>
                  <td>
                    <div className="font-medium text-gray-800">{alert.bl_number}</div>
                    <div className="text-xs text-gray-500">{alert.supplier_name}</div>
                  </td>
                  <td>
                    <span className={`badge ${alert.customs_status === 'Aforo Físico' ? 'badge-danger' : 'badge-warning'}`}>
                      {alert.customs_status}
                    </span>
                  </td>
                  <td>
                    <div className={daysLeft < 0 ? 'text-red-600 font-bold' : 'font-medium'}>
                      {new Date(alert.free_days_deadline).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-600">
                      {daysLeft < 0 ? `Vencido hace ${Math.abs(daysLeft)} días` : `Faltan ${daysLeft} días`}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .table-card-premium {
          background: var(--card);
          border-radius: 24px;
          border: 1px solid var(--border);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          margin-bottom: 24px;
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

        .badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .badge-danger { background: #fee2e2; color: #dc2626; }
        .badge-warning { background: #fff7ed; color: #ea580c; }
        
        .bg-red-50 { background-color: #fef2f2; }
        .text-red-500 { color: #ef4444; }
        .text-red-600 { color: #dc2626; }
        .text-orange-500 { color: #f97316; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-600 { color: #4b5563; }
        .text-gray-800 { color: #1f2937; }
        .font-semibold { font-weight: 600; }
        .font-bold { font-weight: 700; }
        .font-medium { font-weight: 500; }
        .text-xs { font-size: 0.75rem; }
        .flex { display: flex; }
        .items-center { align-items: center; }
        .gap-2 { gap: 0.5rem; }
      `}</style>
    </div>
  );
}
