'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Package, 
  ClipboardList, 
  ShoppingBag, 
  Ship, 
  Users, 
  Factory, 
  User, 
  Settings, 
  HelpCircle,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Maximize2,
  MoreVertical,
  Truck,
  Landmark
} from 'lucide-react';

const navItems = [
  { name: ' Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: ' Logistica', icon: Truck, path: '/logistics' },
  { name: ' Productos', icon: Package, path: '/products' },
  { name: ' Inventario', icon: ClipboardList, path: '/inventory' },
  { name: ' Ventas', icon: ShoppingBag, path: '/sales' },
  { name: ' Importaciones', icon: Ship, path: '/imports' },
  { name: ' Clientes', icon: Users, path: '/customers' },
  { name: ' Proveedores', icon: Factory, path: '/suppliers' },
  { name: ' Finanzas', icon: Landmark, path: '/finance' },
  { name: ' Usuarios', icon: User, path: '/users' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Filtrar items según el rol
  const visibleNavItems = navItems.filter(item => {
    if (!user) return false;
    if (user.role === 'admin') return true; // El admin ve todo
    
    // El Bodeguero ve Dashboard, Logística, Inventario, Productos e Importaciones
    if (user.role === 'warehouse') {
      return ['/dashboard', '/logistics', '/inventory', '/products', '/imports'].includes(item.path);
    }

    // El Vendedor ve Dashboard, Logística, Ventas, Clientes e Inventario
    if (user.role === 'sales') {
      return ['/dashboard', '/logistics', '/sales', '/customers', '/inventory'].includes(item.path);
    }

    // Usuarios estándar
    return item.path === '/dashboard';
  });

  const getRoleDisplay = (role?: string) => {
    if (!role) return 'Usuario';
    const roles: Record<string, string> = {
      'admin': 'Administrador',
      'warehouse': 'Bodeguero',
      'sales': 'Vendedor',
      'user': 'Usuario'
    };
    return roles[role] || role;
  };

  return (
    <nav className="main-navbar">
      {/* --- TOP BAR (Navigation Links) --- */}
      <div className="top-nav">
        <div className="top-nav-container">
          <ul className="top-nav-links">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path));
              return (
                <li key={item.path}>
                  <Link 
                    href={item.path} 
                    className={`top-nav-item ${isActive ? 'active' : ''}`}
                    style={{ color: 'white' }}
                  >
                    <Icon size={16} style={{ color: 'white' }} />
                    <span style={{ color: 'white' }}>{item.name}</span>
                  </Link>
                </li>
              );
            })}
            
          </ul>
        </div>
      </div>

      {/* --- MAIN HEADER BAR (Logo, Search, Profile) --- */}
      <div className="header-nav">
        <div className="header-nav-container">
          {/* Logo */}
          <div className="nav-brand">
             <span className="brand-name" style={{ color: 'white' }}>IMPORTADORA</span>
          </div>

          <div className="header-divider" />

          {/* Search Bar (Solo para Admins) */}
          {user?.role === 'admin' && (
            <div className="advanced-search">
              <Search size={18} className="search-icon-left" style={{ color: 'rgba(255,255,255,0.6)' }} />
              <input type="text" placeholder="Buscar lo que sea..." style={{ color: 'white' }} />
              <div className="search-shortcut" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                 <span className="shortcut-inner" style={{ color: 'rgba(255,255,255,0.6)' }}>⌘ K</span>
              </div>
            </div>
          )}

          {/* Actions & User */}
          <div className="nav-actions-container">
             <div className="quick-actions">
                <button className="action-btn" onClick={toggleTheme}>
                   {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button className="action-btn" title="Fullscreen">
                   <Maximize2 size={18} />
                </button>
                <button className="action-btn" title="Notifications">
                    <div className="notif-dot" />
                    <Bell size={18} />
                </button>
                {user?.role === 'admin' && (
                  <button className="action-btn" title="Settings">
                     <Settings size={18} />
                  </button>
                )}
                <div className="btn-divider" />
             </div>

             <div className="user-profile-box" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}>
                <div className="profile-details">
                    <span className="p-name">{user?.username || 'Usuario'}</span>
                    <span className="p-role">{getRoleDisplay(user?.role)}</span>
                </div>
                <div className="p-avatar-container">
                   <img 
                    src={`https://ui-avatars.com/api/?name=${user?.username || 'John+Doe'}&background=3182ce&color=fff`} 
                    alt="avatar" 
                    className="p-avatar" 
                   />
                   <div className="p-status-online" />
                </div>
                <ChevronDown size={14} className={isUserMenuOpen ? 'rotate-180' : ''} />

                <AnimatePresence>
                  {isUserMenuOpen && (
                    <>
                      <div className="profile-backdrop" onClick={() => setIsUserMenuOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 15, scale: 0.95 }}
                        className="profile-dropdown"
                      >
                         <div className="dropdown-item" onClick={logout}>
                            <LogOut size={16} />
                            <span>Sign Out</span>
                         </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
             </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .main-navbar {
          width: 100%;
          background: #064035 !important; /* Force deep green as brand color */
          font-family: 'Inter', sans-serif;
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        /* --- TOP NAV --- */
        .top-nav {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 10px 0;
          background: #064035 !important;
        }

        .top-nav-container {
          max-width: 1540px;
          margin: 0 auto;
          padding: 0 24px;
        }

        .top-nav-links {
          display: flex;
          align-items: center;
          gap: 36px;
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .top-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          border-radius: 10px;
          text-decoration: none;
          transition: all 0.25s ease;
          cursor: pointer;
          /* Visibility fixes */
          color: #ffffff !important;
        }

        .top-nav-item :global(span),
        .top-nav-item :global(svg) {
          color: #ffffff !important;
          fill: none;
        }

        .top-nav-item:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff !important;
        }

        .top-nav-item.active {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff !important;
        }

        .more-dropdown {
           display: flex;
           align-items: center;
           gap: 4px;
        }

        /* --- HEADER NAV --- */
        .header-nav {
          padding: 16px 0;
        }

        .header-nav-container {
          max-width: 1540px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          align-items: center;
          gap: 24px;
        }

        /* Brand */
        .nav-brand {
           display: flex;
           align-items: center;
           gap: 12px;
           flex-shrink: 0;
        }

        .logo-circle {
           width: 38px;
           height: 38px;
           border: 2px solid var(--brand-text);
           border-radius: 50%;
           display: flex;
           align-items: center;
           justify-content: center;
           position: relative;
        }

        .logo-letter {
           font-weight: 900;
           font-size: 1.4rem;
           color: var(--brand-text);
           letter-spacing: -1px;
        }

        .brand-name {
           font-weight: 800;
           font-size: 1.6rem;
           color: var(--brand-text);
           letter-spacing: -0.5px;
        }

        .header-divider {
           width: 1px;
           height: 32px;
           background: var(--brand-border);
           margin: 0 8px;
        }

        /* Advanced Search */
        .advanced-search {
           flex: 1;
           max-width: 500px;
           background: var(--brand-surface);
           border: 1px solid var(--brand-border);
           border-radius: 12px;
           display: flex;
           align-items: center;
           padding: 0 14px;
           height: 44px;
           gap: 12px;
           transition: all 0.2s;
        }

        .advanced-search:focus-within {
           background: var(--brand-active);
           border-color: rgba(255, 255, 255, 0.3);
           box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
        }

        .search-icon-left {
           color: var(--brand-muted);
        }

        .advanced-search input {
           flex: 1;
           background: transparent;
           border: none;
           outline: none;
           color: white;
           font-size: 0.95rem;
        }

        .advanced-search input::placeholder {
           color: var(--brand-muted);
        }

        .search-shortcut {
           background: rgba(255, 255, 255, 0.08);
           padding: 4px 8px;
           border-radius: 6px;
           color: var(--brand-muted);
           font-size: 0.75rem;
           font-weight: 600;
           border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* Actions container */
        .nav-actions-container {
           display: flex;
           align-items: center;
           gap: 16px;
           flex-shrink: 0;
           margin-left: auto;
        }

        .quick-actions {
           display: flex;
           align-items: center;
           gap: 4px;
        }

        .action-btn {
           width: 40px;
           height: 40px;
           display: flex;
           align-items: center;
           justify-content: center;
           border-radius: 10px;
           color: var(--brand-muted);
           background: transparent;
           transition: all 0.2s;
           position: relative;
        }

        .action-btn:hover {
           background: var(--brand-surface);
           color: white;
        }

        .notif-dot {
           width: 8px;
           height: 8px;
           background: #48bb78;
           border-radius: 50%;
           position: absolute;
           top: 8px;
           right: 8px;
           border: 2px solid var(--brand-bg);
           z-index: 1;
        }

        .btn-divider {
           width: 1px;
           height: 24px;
           background: var(--brand-border);
           margin: 0 12px;
        }

        /* User Profile */
        .user-profile-box {
           display: flex;
           align-items: center;
           gap: 12px;
           cursor: pointer;
           position: relative;
        }

        .profile-details {
           display: flex;
           flex-direction: column;
           align-items: flex-end;
        }

        .p-name {
           font-weight: 700;
           font-size: 0.9rem;
           color: white;
           line-height: 1.2;
        }

        .p-role {
           font-size: 0.75rem;
           color: var(--brand-muted);
        }

        .p-avatar-container {
           position: relative;
        }

        .p-avatar {
           width: 40px;
           height: 40px;
           border-radius: 50%;
           object-fit: cover;
           border: 2px solid var(--brand-surface);
        }

        .p-status-online {
           width: 12px;
           height: 12px;
           background: #48bb78;
           border-radius: 50%;
           position: absolute;
           bottom: 0;
           right: 0;
           border: 2px solid var(--brand-bg);
        }

        .rotate-180 {
           transform: rotate(180deg);
        }

        .profile-dropdown {
           position: absolute;
           top: calc(100% + 20px);
           right: 0;
           background: #1a5248;
           border: 1px solid var(--brand-border);
           border-radius: 12px;
           min-width: 160px;
           padding: 8px;
           box-shadow: 0 10px 25px rgba(0,0,0,0.3);
           z-index: 1001;
        }

        .dropdown-item {
           display: flex;
           align-items: center;
           gap: 12px;
           padding: 10px 14px;
           border-radius: 8px;
           color: #fff;
           font-size: 0.9rem;
           transition: background 0.2s;
        }

        .dropdown-item:hover {
           background: rgba(255, 255, 255, 0.1);
        }

        .profile-backdrop {
           position: fixed;
           top: 0;
           left: 0;
           right: 0;
           bottom: 0;
           z-index: -1;
        }

        @media (max-width: 1024px) {
           .brand-name { display: none; }
           .top-nav-links span { display: none; }
           .profile-details { display: none; }
        }
        @media (max-width: 768px) {
           .top-nav-container { padding: 0 16px; }
           .header-nav-container { padding: 0 16px; gap: 12px; }
           .top-nav-links { 
             gap: 16px; 
             overflow-x: auto; 
             padding-bottom: 4px; 
             -ms-overflow-style: none; 
             scrollbar-width: none; 
           }
           .top-nav-links::-webkit-scrollbar { display: none; }
           .advanced-search { display: none; }
           .nav-actions-container { gap: 8px; }
           .action-btn { width: 36px; height: 36px; }
           .p-avatar { width: 34px; height: 34px; }
           .logo-circle { width: 32px; height: 32px; }
           .logo-letter { font-size: 1.2rem; }
        }
      `}</style>
    </nav>
  );
}
