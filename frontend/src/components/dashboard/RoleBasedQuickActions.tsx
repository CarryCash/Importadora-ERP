'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../AuthProvider';
import { 
  PackagePlus, 
  Settings, 
  ShoppingCart, 
  FileText, 
  Users, 
  Truck,
  PlusCircle,
  FileBox
} from 'lucide-react';

export default function RoleBasedQuickActions() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) return null;

  let actions: Array<{ label: string; icon: React.ReactNode; path: string }> = [];

  switch (user.role) {
    case 'warehouse':
      actions = [
        { label: 'Hacer Ajuste', icon: <Settings size={24} />, path: '/inventory' },
        { label: 'Recibir Carga', icon: <Truck size={24} />, path: '/logistics' }
      ];
      break;
    case 'sales':
      actions = [
        { label: 'Nueva Venta', icon: <ShoppingCart size={24} />, path: '/sales' },
        { label: 'Ver Cotizaciones', icon: <FileText size={24} />, path: '/sales' }
      ];
      break;
    case 'admin':
    case 'manager':
      actions = [
        { label: 'Nueva Venta', icon: <ShoppingCart size={24} />, path: '/sales' },
        { label: 'Recibir Carga', icon: <Truck size={24} />, path: '/logistics' },
        { label: 'Gestionar Usuarios', icon: <Users size={24} />, path: '/users' },
        { label: 'Hacer Ajuste', icon: <Settings size={24} />, path: '/inventory' }
      ];
      break;
    default:
      actions = [];
  }

  if (actions.length === 0) return null;

  return (
    <div className="quick-actions-card">
      <h3>⚡ Acciones Rápidas</h3>
      <div className="actions-grid">
        {actions.map((action, idx) => (
          <button 
            key={idx} 
            className="action-btn" 
            onClick={() => router.push(action.path)}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .quick-actions-card {
          padding: 24px 32px;
          background: var(--card);
          border-radius: 24px;
          border: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          margin-bottom: 24px;
        }

        .quick-actions-card h3 {
          font-size: 1.1rem;
          font-weight: 800;
          margin-bottom: 20px;
          color: var(--foreground);
        }

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
        }

        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
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
          transform: translateY(-4px);
          box-shadow: 0 6px 12px rgba(6, 64, 53, 0.15);
          border-color: #064035;
        }

        .action-btn span {
          font-size: 0.85rem;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
