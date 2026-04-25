import React from 'react';
import { Truck, Package, DollarSign, TrendingUp } from 'lucide-react';

interface QuickStatsBannerProps {
  inTransitImports: number;
  pendingOrders: number;
  salesToday: number;
  totalRevenue: number;
}

export default function QuickStatsBanner({
  inTransitImports,
  pendingOrders,
  salesToday,
  totalRevenue,
}: QuickStatsBannerProps) {
  return (
    <div className="quick-stats-banner">
      <div className="stat-item">
        <div className="stat-icon imports"><Truck size={18} /></div>
        <div className="stat-info">
          <span className="stat-label">En Tránsito</span>
          <span className="stat-value">{inTransitImports}</span>
        </div>
      </div>
      
      <div className="stat-divider" />
      
      <div className="stat-item">
        <div className="stat-icon orders"><Package size={18} /></div>
        <div className="stat-info">
          <span className="stat-label">Pedidos Pendientes</span>
          <span className="stat-value">{pendingOrders}</span>
        </div>
      </div>
      
      <div className="stat-divider" />
      
      <div className="stat-item">
        <div className="stat-icon sales"><TrendingUp size={18} /></div>
        <div className="stat-info">
          <span className="stat-label">Ventas Hoy</span>
          <span className="stat-value">{salesToday}</span>
        </div>
      </div>
      
      <div className="stat-divider" />
      
      <div className="stat-item">
        <div className="stat-icon revenue"><DollarSign size={18} /></div>
        <div className="stat-info">
          <span className="stat-label">Ingresos Totales (Mes)</span>
          <span className="stat-value">${Number(totalRevenue || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <style jsx>{`
        .quick-stats-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px 24px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 16px;
          flex: 1;
        }

        .stat-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .stat-icon.imports { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
        .stat-icon.orders { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
        .stat-icon.sales { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        .stat-icon.revenue { background: linear-gradient(135deg, #064035 0%, #032a22 100%); }

        .stat-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--foreground);
          line-height: 1;
        }

        .stat-divider {
          width: 1px;
          height: 40px;
          background: var(--border);
          margin: 0 24px;
        }

        @media (max-width: 1024px) {
          .quick-stats-banner {
            flex-wrap: wrap;
            gap: 16px;
          }
          .stat-divider {
            display: none;
          }
          .stat-item {
            min-width: calc(50% - 16px);
          }
        }

        @media (max-width: 640px) {
          .stat-item {
            min-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
