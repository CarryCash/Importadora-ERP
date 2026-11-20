import React from 'react';
import { Ship, Anchor, Calendar, MapPin, PackageOpen, ChevronRight, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface UpcomingImport {
  id: string;
  estimated_arrival: string;
  status: string;
  country: string;
  bl_number: string;
  supplier_name: string;
}

interface Props {
  imports: UpcomingImport[];
}

export default function UpcomingImportsWidget({ imports }: Props) {
  const router = useRouter();

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'IN_TRANSIT':
        return { text: 'En altamar', icon: <Ship size={14} />, className: 'status-transit' };
      case 'CUSTOMS':
        return { text: 'En Aduana', icon: <Anchor size={14} />, className: 'status-customs' };
      default:
        return { text: status, icon: <Ship size={14} />, className: 'status-default' };
    }
  };

  const calculateDaysLeft = (etaStr: string) => {
    if (!etaStr) return '?';
    const eta = new Date(etaStr);
    const today = new Date();
    const diffTime = eta.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Atrasado';
    if (diffDays === 0) return 'Hoy';
    return `En ${diffDays} días`;
  };

  return (
    <div className="card upcoming-imports-widget">
      <div className="widget-header">
        <div>
          <h3><Ship size={17} /> Próximos Arribos</h3>
          <p className="widget-desc">Contenedores en tránsito y aduana</p>
        </div>
        <button className="btn-view-all" onClick={() => router.push('/imports')}>
          Ver Todos <ChevronRight size={16} />
        </button>
      </div>

      <div className="widget-body">
        {(!imports || imports.length === 0) ? (
          <div className="empty-state">
            <PackageOpen size={32} className="empty-icon" />
            <p>No hay importaciones en tránsito actualmente.</p>
          </div>
        ) : (
          <div className="imports-list">
            {imports.map((item) => {
              const statusDisplay = getStatusDisplay(item.status);
              return (
                <div key={item.id} className="import-item">
                  
                  <div className="import-origin">
                    <span className="country-flag"><Globe size={18} aria-hidden="true" /></span>
                  </div>

                  <div className="import-main-info">
                    <div className="supplier-name">{item.supplier_name}</div>
                    <div className="import-details">
                      <span className="detail-pill">BL: {item.bl_number || 'N/A'}</span>
                      <span className="detail-pill"><MapPin size={12} /> {item.country || 'Desconocido'}</span>
                    </div>
                  </div>

                  <div className="import-timing">
                    <div className="eta-badge">
                      <Calendar size={14} />
                      {item.estimated_arrival ? new Date(item.estimated_arrival).toLocaleDateString() : 'Sin fecha'}
                    </div>
                    <div className="days-left">{calculateDaysLeft(item.estimated_arrival)}</div>
                  </div>

                  <div className="import-status">
                    <span className={`status-badge ${statusDisplay.className}`}>
                      {statusDisplay.icon}
                      {statusDisplay.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .upcoming-imports-widget {
          background: var(--card);
          border-radius: 24px;
          border: 1px solid var(--border);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          display: flex;
          flex-direction: column;
        }

        .widget-header {
          padding: 24px 32px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .widget-header h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--foreground);
          margin-bottom: 4px;
        }

        .widget-desc {
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
          color: #0369a1; /* Blue */
          background: #f0f9ff;
          padding: 8px 16px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: 0.2s;
        }

        .btn-view-all:hover {
          background: #e0f2fe;
          transform: translateX(4px);
        }

        .widget-body {
          padding: 16px 32px;
          flex: 1;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 0;
          color: #94a3b8;
          text-align: center;
        }

        .empty-icon {
          margin-bottom: 12px;
          opacity: 0.5;
        }

        .imports-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .import-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--background);
          transition: all 0.2s ease;
        }

        .import-item:hover {
          border-color: #bae6fd;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          transform: translateY(-2px);
        }

        .import-origin {
          width: 48px;
          height: 48px;
          background: #f8fafc;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .import-main-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .supplier-name {
          font-weight: 700;
          color: var(--foreground);
          font-size: 0.95rem;
        }

        .import-details {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .detail-pill {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          background: var(--secondary);
          padding: 2px 8px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
        }

        .import-timing {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          min-width: 100px;
        }

        .eta-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--foreground);
        }

        .days-left {
          font-size: 0.75rem;
          font-weight: 800;
          color: #ef4444; /* Red for urgency */
        }

        .import-status {
          min-width: 110px;
          display: flex;
          justify-content: flex-end;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .status-transit {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #dbeafe;
        }

        .status-customs {
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #ffedd5;
        }

        .status-default {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        @media (max-width: 768px) {
          .import-item {
            flex-direction: column;
            align-items: flex-start;
          }
          .import-timing, .import-status {
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
