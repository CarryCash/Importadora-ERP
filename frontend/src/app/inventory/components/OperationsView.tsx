'use client';

import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Sliders,
  ClipboardCheck,
  BookmarkPlus,
} from 'lucide-react';

interface OperationsViewProps {
  onOpenTransferModal: () => void;
  onOpenAdjustModal: () => void;
  onOpenForecastModal: () => void;
  onOpenCounts: () => void;
}

export default function OperationsView({
  onOpenTransferModal,
  onOpenAdjustModal,
  onOpenForecastModal,
  onOpenCounts,
}: OperationsViewProps) {
  const operations = [
    {
      id: 'receipts',
      title: 'Recepciones & Entradas',
      desc: 'Ingreso formal de mercancía desde compras nacionales, importaciones y devoluciones con creación de capas FIFO.',
      icon: ArrowDownLeft,
      colorClass: 'op-color-green',
      actionLabel: 'Ver Recepciones',
      link: '/receiving',
    },
    {
      id: 'issues',
      title: 'Salidas de Mercancía',
      desc: 'Despacho por venta, consumo interno o bajas con consumo ordenado de capas de costo FIFO.',
      icon: ArrowUpRight,
      colorClass: 'op-color-red',
      actionLabel: 'Ver Despachos',
      link: '/dispatch',
    },
    {
      id: 'transfers',
      title: 'Transferencias entre Bodegas',
      desc: 'Traslado de existencias conservando capas FIFO y número de serie a través de bodega de tránsito.',
      icon: ArrowLeftRight,
      colorClass: 'op-color-blue',
      actionLabel: 'Nueva Transferencia',
      onClick: onOpenTransferModal,
    },
    {
      id: 'adjustments',
      title: 'Ajustes Auditados',
      desc: 'Corrección justificada de diferencias físicas o de valor con impacto auditable en balances y libros.',
      icon: Sliders,
      colorClass: 'op-color-amber',
      actionLabel: 'Registrar Ajuste',
      onClick: onOpenAdjustModal,
    },
    {
      id: 'counts',
      title: 'Conteos Físicos',
      desc: 'Ejecución de inventarios generales y cíclicos con corte transaccional y conciliación contra sistema.',
      icon: ClipboardCheck,
      colorClass: 'op-color-purple',
      actionLabel: 'Iniciar Conteo',
      onClick: onOpenCounts,
    },
    {
      id: 'forecasting',
      title: 'Planificación & Reorden',
      desc: 'Pronóstico de consumo diario promedio (ADS), días de inventario restante y puntos de reorden.',
      icon: BookmarkPlus,
      colorClass: 'op-color-indigo',
      actionLabel: 'Ver Pronóstico',
      onClick: onOpenForecastModal,
    },
  ];

  return (
    <div className="ops-grid-wrapper">
      <div className="ops-grid">
        {operations.map((op) => {
          const Icon = op.icon;
          return (
            <div key={op.id} className="ops-card">
              <div>
                <div className="ops-card-header">
                  <span className={`ops-icon-wrap ${op.colorClass}`}>
                    <Icon size={22} />
                  </span>
                  <h4 className="ops-card-title">{op.title}</h4>
                </div>
                <p className="ops-card-desc">{op.desc}</p>
              </div>

              {op.link ? (
                <a href={op.link} className="action-btn ops-link-btn">
                  {op.actionLabel}
                </a>
              ) : (
                <button onClick={op.onClick} className="primary-btn ops-action-btn">
                  {op.actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .ops-grid-wrapper {
          padding: 4px 0;
        }
        .ops-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        @media (max-width: 1100px) {
          .ops-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 680px) {
          .ops-grid {
            grid-template-columns: 1fr;
          }
        }
        .ops-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 22px 20px 18px;
          border-radius: 18px;
          background: var(--surface, #fff);
          border: 1px solid var(--border-color, #e5eaf0);
          box-shadow: 0 4px 14px #0f172a06;
          gap: 16px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ops-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 6px 20px #0f172a0d;
        }
        .ops-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .ops-icon-wrap {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 14px;
          flex-shrink: 0;
        }
        .op-color-green  { background: #d1fae5; color: #065f46; }
        .op-color-red    { background: #fee2e2; color: #991b1b; }
        .op-color-blue   { background: #dbeafe; color: #1e40af; }
        .op-color-amber  { background: #fef3c7; color: #92400e; }
        .op-color-purple { background: #ede9fe; color: #5b21b6; }
        .op-color-indigo { background: #e0e7ff; color: #3730a3; }
        .ops-card-title {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-primary, #0f172a);
          margin: 0;
        }
        .ops-card-desc {
          font-size: 12px;
          color: var(--text-secondary, #64748b);
          line-height: 1.6;
          margin: 0 0 4px;
        }
        .ops-link-btn {
          display: block;
          text-align: center;
          text-decoration: none;
          width: 100%;
          box-sizing: border-box;
          justify-content: center;
        }
        .ops-action-btn {
          width: 100%;
          justify-content: center;
        }
        /* Inherit global .primary-btn and .action-btn from parent page styles */
        .primary-btn {
          background: #047857;
          border: 1px solid #059669;
          color: #fff;
          padding: 10px 18px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: 0.15s;
        }
        .primary-btn:hover {
          background: #059669;
        }
        .action-btn {
          border: 1px solid var(--border-color, #e5eaf0);
          background: var(--surface, #fff);
          color: var(--text-primary, #1e293b);
          padding: 9px 14px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: 0.15s;
        }
        .action-btn:hover {
          background: #f1f5f9;
        }
      `}</style>
    </div>
  );
}
