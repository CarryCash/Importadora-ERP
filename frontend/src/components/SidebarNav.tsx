'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import GlobalSearch from './GlobalSearch';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Factory,
  Landmark,
  LayoutDashboard,
  LogOut,
  PackageOpen,
  Menu,
  Moon,
  Package,
  Ship,
  ShoppingBag,
  Settings,
  ShieldCheck,
  Sun,
  Truck,
  User,
  Users,
  X,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Logística', icon: Truck, path: '/logistics' },
  { name: 'Productos', icon: Package, path: '/products' },
  { name: 'Inventario', icon: ClipboardList, path: '/inventory' },
  { name: 'Ventas', icon: ShoppingBag, path: '/sales' },
  { name: 'Importaciones', icon: Ship, path: '/imports' },
  { name: 'Clientes', icon: Users, path: '/customers' },
  { name: 'Proveedores', icon: Factory, path: '/suppliers' },
  { name: 'Finanzas', icon: Landmark, path: '/finance' },
  { name: 'Usuarios', icon: User, path: '/users' },
  { name: 'Seguridad', icon: ShieldCheck, path: '/security' },
  { name: 'Configuración', icon: Settings, path: '/settings' },
];

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  erp_admin: 'Administrador ERP',
  warehouse: 'Bodeguero',
  sales: 'Vendedor',
  user: 'Usuario',
};

export default function SidebarNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggleTheme, preferences } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLogisticsOpen, setIsLogisticsOpen] = useState(false);
  const [isImportsOpen, setIsImportsOpen] = useState(false);
  const [isSuppliersOpen, setIsSuppliersOpen] = useState(false);

  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem('erp-sidebar-collapsed') === 'true');
    } catch {
      // Keep the default expanded state if browser storage is unavailable.
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        window.localStorage.setItem('erp-sidebar-collapsed', String(next));
      } catch {
        // The in-memory state still works if browser storage is unavailable.
      }
      return next;
    });
  };

  const positionNavFlyout = (group: HTMLDivElement) => {
    const maxTop = Math.max(12, window.innerHeight - 580);
    group.style.setProperty('--nav-flyout-top', `${Math.max(12, Math.min(group.getBoundingClientRect().top, maxTop))}px`);
  };

  useEffect(() => {
    setIsMobileOpen(false);
    setIsUserMenuOpen(false);
    setIsLogisticsOpen(false);
    setIsImportsOpen(false);
    setIsSuppliersOpen(false);
  }, [pathname]);

  const visibleNavItems = navItems.filter((item) => {
    if (!user) return false;
    if (item.path === '/settings') return Boolean(user.roles?.some(role=>['admin','erp_admin'].includes(role))||user.role==='admin');
    if (item.path === '/security') return Boolean(user.roles?.some(role=>['admin','erp_admin'].includes(role))||user.role==='admin');
    if (user.role === 'admin') return true;
    const module = item.path.slice(1);
    if (item.path === '/imports') return Boolean(user.permissions?.some((permission) => ['imports.read','imports.write','imports.receive','imports.logistics.read','imports.logistics.manage'].includes(permission)));
    if (item.path === '/logistics') return Boolean(user.permissions?.some((permission) => ['logistics.read','receiving.read','storage.read','dispatch.read','dispatch.manage','dispatch.pick','dispatch.pack','dispatch.confirm','transfers.read','transfers.request','transfers.approve','transfers.ship','transfers.receive','transfers.cancel','tms.read','tms.manage','tms.dispatch','tms.delivery','tms.finance','tms.incidents','returns.read','returns.manage','returns.receive','returns.resolve','logistics_inventory.read','logistics_inventory.count','logistics_inventory.reconcile','imports.logistics.read','imports.logistics.manage','exports.logistics.read','exports.logistics.manage','logistics_quality.read','logistics_quality.manage','logistics_costs.read','logistics_costs.manage','logistics_control.read','logistics_incidents.manage','logistics_assets.manage','logistics_services.manage','logistics_automation.manage','logistics_docks.manage'].includes(permission)));
    return user.permissions?.includes(`${module}.read`) ?? item.path === '/dashboard';
  });

  const closeMobileMenu = () => setIsMobileOpen(false);

  return (
    <>
    <aside
      className={
        'main-navbar' +
        (isCollapsed ? ' is-collapsed' : '') +
        (isMobileOpen ? ' is-mobile-open' : '')
      }
      aria-label="Navegación principal"
      style={{ '--brand-bg': preferences.brandColor } as React.CSSProperties}
    >
      <div className="sidebar-header">
        <Link href="/dashboard" className="brand-lockup" onClick={closeMobileMenu} aria-label="Importadora ERP">
          <span className="brand-mark">{preferences.logoDataUrl ? <img src={preferences.logoDataUrl} alt="" /> : 'I'}</span>
          <span className="brand-name">{preferences.companyName}</span>
        </Link>

        <button
          type="button"
          className="collapse-toggle"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setIsMobileOpen((open) => !open)}
          aria-label={isMobileOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={isMobileOpen}
        >
          {isMobileOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>

      <button
        type="button"
        className="sidebar-scrim"
        aria-label="Cerrar menú"
        tabIndex={isMobileOpen ? 0 : -1}
        onClick={closeMobileMenu}
      />

      <div className="sidebar-content">
        <nav className="nav-links" aria-label="Secciones">
          {visibleNavItems.filter((item) => item.path === '/settings' || item.path === '/security'
            ? Boolean(user?.roles?.some(role=>['admin','erp_admin'].includes(role))||user?.role==='admin')
            : item.path === '/dashboard' || preferences.enabledModules.includes(item.path.slice(1))).map((item) => {
            const Icon = item.icon;
            if (item.path === '/suppliers') {
              const suppliersActive = pathname.startsWith('/suppliers');
              const subItems = [
                { label: 'Panel general', path: '/suppliers' },
                { label: 'Proveedores nacionales', path: '/suppliers/national' },
                { label: 'Proveedores internacionales', path: '/suppliers/international' },
                { label: 'Categorías', path: '/suppliers/categories' },
                { label: 'Aprobaciones', path: '/suppliers/approvals' },
                { label: 'Evaluación y riesgos', path: '/suppliers/evaluation' },
                { label: 'Documentación', path: '/suppliers/documents' },
                { label: 'Análisis', path: '/suppliers/analysis' },
                { label: 'Configuración', path: '/suppliers/settings' },
              ];
              return (
                <div key={item.path} className={'nav-group suppliers-nav-group' + (isSuppliersOpen ? ' is-open' : '') + (suppliersActive ? ' has-active-child' : '')}
                  onMouseEnter={(event) => { positionNavFlyout(event.currentTarget); if (window.matchMedia('(hover: hover)').matches) setIsSuppliersOpen(true); }}
                  onMouseLeave={() => { if (window.matchMedia('(hover: hover)').matches) setIsSuppliersOpen(false); }}>
                  <div className="nav-group-heading">
                    <div className="nav-item suppliers-parent" title={isCollapsed ? item.name : undefined}><Icon size={19} aria-hidden="true"/><span className="nav-label">{item.name}</span></div>
                    <button type="button" className="nav-group-toggle" onClick={() => setIsSuppliersOpen((open) => !open)} aria-label={isSuppliersOpen ? 'Ocultar secciones de Proveedores' : 'Mostrar secciones de Proveedores'} aria-expanded={isSuppliersOpen}><ChevronDown size={15}/></button>
                  </div>
                  <div className="nav-submenu" aria-label="Secciones de Proveedores">
                    {subItems.map((subItem) => { const active = subItem.path === '/suppliers' ? pathname === '/suppliers' : pathname === subItem.path || pathname.startsWith(`${subItem.path}/`); return <Link key={subItem.path} href={subItem.path} className={'nav-subitem' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={closeMobileMenu}>{subItem.label}</Link>; })}
                  </div>
                </div>
              );
            }
            if (item.path === '/imports') {
              const importsActive = pathname.startsWith('/imports') || pathname.startsWith('/logistics/imports');
              const subItems = [
                { label: 'Gestión de importaciones', path: '/imports' },
                { label: 'Expediente y embarques', path: '/logistics/imports' },
              ];
              return (
                <div key={item.path} className={'nav-group imports-nav-group' + (isImportsOpen ? ' is-open' : '') + (importsActive ? ' has-active-child' : '')}
                  onMouseEnter={(event) => { positionNavFlyout(event.currentTarget); if (window.matchMedia('(hover: hover)').matches) setIsImportsOpen(true); }}
                  onMouseLeave={() => { if (window.matchMedia('(hover: hover)').matches) setIsImportsOpen(false); }}>
                  <div className="nav-group-heading">
                    <div className="nav-item imports-parent" title={isCollapsed ? item.name : undefined}>
                      <Icon size={19} aria-hidden="true" /><span className="nav-label">{item.name}</span>
                    </div>
                    <button type="button" className="nav-group-toggle" onClick={() => setIsImportsOpen((open) => !open)} aria-label={isImportsOpen ? 'Ocultar secciones de Importaciones' : 'Mostrar secciones de Importaciones'} aria-expanded={isImportsOpen}><ChevronDown size={15} /></button>
                  </div>
                  <div className="nav-submenu" aria-label="Secciones de Importaciones">
                    {subItems.map((subItem) => {const active = subItem.path === '/imports' ? pathname === '/imports' || pathname.startsWith('/imports/') : pathname === subItem.path || pathname.startsWith(`${subItem.path}/`);return <Link key={subItem.path} href={subItem.path} className={'nav-subitem' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={closeMobileMenu}>{subItem.label}</Link>;})}
                  </div>
                </div>
              );
            }
            if (item.path === '/logistics') {
              const logisticsActive = pathname.startsWith('/logistics') || pathname.startsWith('/receiving') || pathname.startsWith('/storage') || pathname.startsWith('/dispatch') || pathname.startsWith('/transfers') || pathname.startsWith('/tms');
              const subItems = [
                { label: 'Operaciones', path: '/logistics' },
                { label: 'Configuración', path: '/logistics/configuration' },
                { label: 'Recepción', path: '/receiving' },
                { label: 'Almacenamiento', path: '/storage' },
                { label: 'Preparación y despacho', path: '/dispatch' },
                { label: 'Transferencias', path: '/transfers' },
                { label: 'Transporte y distribución', path: '/tms' },
                { label: 'Devoluciones', path: '/logistics/returns' },
                { label: 'Inventarios y trazabilidad', path: '/logistics/inventory-traceability' },
                { label: 'Exportaciones', path: '/logistics/exports' },
                { label: 'Control de calidad', path: '/logistics/quality' },
                { label: 'Costos y liquidaciones', path: '/logistics/costs' },
                { label: 'Centro de control', path: '/logistics/control' },
                { label: 'Citas y muelles', path: '/logistics/docks' },
              ];
              return (
                <div
                  key={item.path}
                  className={'nav-group logistics-nav-group' + (isLogisticsOpen ? ' is-open' : '') + (logisticsActive ? ' has-active-child' : '')}
                  onMouseEnter={(event) => { positionNavFlyout(event.currentTarget); if (window.matchMedia('(hover: hover)').matches) setIsLogisticsOpen(true); }}
                  onMouseLeave={() => { if (window.matchMedia('(hover: hover)').matches) setIsLogisticsOpen(false); }}
                >
                  <div className="nav-group-heading">
                    <div className="nav-item logistics-parent" title={isCollapsed ? item.name : undefined}>
                      <Icon size={19} aria-hidden="true" />
                      <span className="nav-label">{item.name}</span>
                    </div>
                    <button type="button" className="nav-group-toggle" onClick={() => setIsLogisticsOpen((open) => !open)} aria-label={isLogisticsOpen ? 'Ocultar secciones de Logística' : 'Mostrar secciones de Logística'} aria-expanded={isLogisticsOpen}>
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  <div className="nav-submenu" aria-label="Secciones de Logística">
                    {subItems.map((subItem) => {
                      const active = subItem.path === '/logistics'
                        ? pathname === '/logistics'
                        : pathname === subItem.path || pathname.startsWith(`${subItem.path}/`);
                      return <Link key={subItem.path} href={subItem.path} className={'nav-subitem' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={closeMobileMenu}>{subItem.label}</Link>;
                    })}
                  </div>
                </div>
              );
            }
            const isActive =
              pathname === item.path ||
              (item.path !== '/dashboard' && pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                href={item.path}
                className={'nav-item' + (isActive ? ' active' : '')}
                aria-current={isActive ? 'page' : undefined}
                title={isCollapsed ? item.name : undefined}
                onClick={closeMobileMenu}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="nav-label">{item.name}</span>
              </Link>
            );
          })}
        </nav>

      </div>
    </aside>
    <header className="erp-topbar" style={{ '--brand-bg': preferences.brandColor } as React.CSSProperties}>
      <GlobalSearch />
      <button
        type="button"
        className="topbar-theme-button"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}
        title={theme === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'}
      >
        {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
      </button>
      <div className="profile-area topbar-profile-area">
        <button
          type="button"
          className="topbar-profile-button"
          onClick={() => setIsUserMenuOpen((open) => !open)}
          aria-expanded={isUserMenuOpen}
          aria-label="Abrir perfil y opciones de usuario"
        >
          {user?.avatar_url ? <img className="topbar-avatar-image" src={user.avatar_url} alt="" /> : <span className="p-avatar" aria-hidden="true">{(user?.full_name || user?.username || 'U').slice(0, 1).toUpperCase()}</span>}
          <span className="topbar-profile-details"><strong>{user?.full_name || user?.username || 'Usuario'}</strong><small>{roleLabels[user?.role || ''] || (user?.role||'Usuario').replaceAll('_',' ')}</small></span>
          <ChevronDown size={15} className={isUserMenuOpen ? 'rotate-180' : ''} />
        </button>

        <AnimatePresence>
          {isUserMenuOpen && (
            <>
              <button type="button" className="profile-backdrop" aria-label="Cerrar opciones de usuario" onClick={() => setIsUserMenuOpen(false)} />
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} className="profile-dropdown">
                <Link href="/profile" className="dropdown-item" onClick={() => setIsUserMenuOpen(false)}><User size={16} /><span>Mi perfil</span></Link>
                {user?.role === 'admin' && <Link href="/settings" className="dropdown-item" onClick={() => setIsUserMenuOpen(false)}><Settings size={16} /><span>Configuración</span></Link>}
                <button type="button" className="dropdown-item" onClick={() => { setIsUserMenuOpen(false); logout(); }}><LogOut size={16} /><span>Cerrar sesión</span></button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
    </>
  );
}
