import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Activity } from 'lucide-react';

interface FlowData {
  day: string;
  income: number;
  expense: number;
}

interface Props {
  data: FlowData[];
}

export default function WeeklyFlowChartWidget({ data }: Props) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          <div className="tooltip-item income">
            <span>Ingresos:</span>
            <strong>{formatCurrency(payload[0].value)}</strong>
          </div>
          <div className="tooltip-item expense">
            <span>Gastos:</span>
            <strong>{formatCurrency(payload[1].value)}</strong>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card chart-widget-container">
      <div className="widget-header">
        <div>
          <h3><Activity size={18} className="header-icon" /> Flujo de Caja (Últimos 7 días)</h3>
          <p className="widget-desc">Entradas por ventas vs. Salidas por importaciones</p>
        </div>
      </div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="day" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: '#64748b' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 12, fill: '#64748b' }} 
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Area 
              type="monotone" 
              dataKey="income" 
              name="Ingresos" 
              stroke="#10b981" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorIncome)" 
            />
            <Area 
              type="monotone" 
              dataKey="expense" 
              name="Gastos" 
              stroke="#ef4444" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorExpense)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <style jsx>{`
        .chart-widget-container {
          background: var(--card);
          border-radius: 24px;
          border: 1px solid var(--border);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 380px;
        }

        .widget-header {
          padding: 24px 32px 16px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .widget-header h3 {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--foreground);
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-icon {
          color: #064035;
        }

        .widget-desc {
          font-size: 0.85rem;
          color: #94a3b8;
          margin: 0;
        }

        .chart-wrapper {
          flex: 1;
          padding: 0 32px 24px 16px;
          min-height: 250px;
        }

        :global(.custom-tooltip) {
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid var(--border);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          border-radius: 12px;
          padding: 12px 16px;
          backdrop-filter: blur(8px);
        }

        :global(.tooltip-label) {
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 8px;
          font-size: 0.9rem;
        }

        :global(.tooltip-item) {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          font-size: 0.85rem;
          margin-bottom: 4px;
        }

        :global(.tooltip-item span) {
          color: var(--muted-foreground);
        }

        :global(.tooltip-item.income strong) {
          color: #10b981;
        }

        :global(.tooltip-item.expense strong) {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
