'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, Command } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';

type SearchResult = { label: string; detail: string; href: string; kind: string };

const shortcuts = [
  { label: 'Panel de control', href: '/dashboard', words: 'dashboard inicio resumen' },
  { label: 'Ventas y POS', href: '/sales', words: 'ventas pos caja facturas' },
  { label: 'Productos', href: '/products', words: 'productos catálogo sku' },
  { label: 'Inventario', href: '/inventory', words: 'inventario stock bodega lotes' },
  { label: 'Importaciones', href: '/imports', words: 'importaciones embarques contenedores' },
  { label: 'Logística', href: '/logistics', words: 'logistica entregas rutas' },
  { label: 'Logística · Configuración', href: '/logistics/configuration', words: 'logistica configuracion bodegas muelles' },
  { label: 'Logística · Recepción', href: '/receiving', words: 'recepcion compras ingreso bodega inspeccion' },
  { label: 'Logística · Almacenamiento', href: '/storage', words: 'ubicaciones putaway picking capacidad cuarentena bodega' },
  { label: 'Logística · Preparación y despacho', href: '/dispatch', words: 'despacho preparación picking empaque etiquetas oleadas envíos' },
  { label: 'Logística · Transferencias', href: '/transfers', words: 'transferencias traslados sucursales bodegas tránsito recepción diferencias daños pérdidas' },
  { label: 'Logística · Transporte y distribución', href: '/tms', words: 'tms transporte distribución transportistas flota conductores vehículos rutas viajes paradas entregas manifiesto POD gastos siniestros' },
  { label: 'Logística · Devoluciones', href: '/logistics/returns', words: 'devoluciones logística inversa garantías reclamos inspección reparación retorno' },
  { label: 'Logística · Inventarios y trazabilidad', href: '/logistics/inventory-traceability', words: 'inventario lotes series trazabilidad existencias conteos FIFO FEFO auditoría' },
  { label: 'Logística · Control de calidad', href: '/logistics/quality', words: 'calidad inspección muestreo cuarentena temperatura cadena frío vencimiento peligrosos incidentes' },
  { label: 'Logística · Costos y liquidaciones', href: '/logistics/costs', words: 'costos gastos liquidaciones tarifas presupuesto facturas conciliación finanzas centros sobrecostos' },
  { label: 'Clientes', href: '/customers', words: 'clientes cartera' },
  { label: 'Proveedores', href: '/suppliers', words: 'proveedores fábricas' },
  { label: 'Finanzas', href: '/finance', words: 'finanzas gastos balance' },
  { label: 'Equipo y usuarios', href: '/users', words: 'usuarios equipo permisos' },
  { label: 'Mi perfil', href: '/profile', words: 'perfil cuenta contraseña' },
  { label: 'Configuración del panel', href: '/settings', words: 'configuración logo tema apariencia menu' },
];

export default function GlobalSearch() {
  const { token, user } = useAuth();
  const { preferences } = useTheme();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const matchingShortcuts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    const allowed = shortcuts.filter((item) => {
      const path = item.href;
      if (path === '/profile') return true;
      if (path === '/settings' || path === '/users') return user?.role === 'admin';
      const isLogisticsSection = path.startsWith('/logistics') || path === '/receiving' || path === '/storage' || path === '/dispatch' || path === '/transfers' || path === '/tms';
      const logisticsPermission = path === '/storage' ? 'storage.read' : path === '/receiving' ? 'receiving.read' : path === '/dispatch' ? 'dispatch.read' : path === '/transfers' ? 'transfers.read' : path === '/tms' ? 'tms.read' : path === '/logistics/returns' ? 'returns.read' : path === '/logistics/inventory-traceability' ? 'logistics_inventory.read' : path === '/logistics/quality' ? 'logistics_quality.read' : path === '/logistics/costs' ? 'logistics_costs.read' : 'logistics.read';
      const allowedByRole = user?.role === 'admin' ||
        (isLogisticsSection && Boolean(user?.permissions?.includes(logisticsPermission))) ||
        (path === '/dashboard' && (user?.permissions?.includes('dashboard.read') ?? true)) ||
        Boolean(user?.permissions?.includes(`${path.slice(1)}.read`));
      const enabled = path === '/dashboard' || isLogisticsSection || preferences.enabledModules.includes(path.slice(1));
      return allowedByRole && enabled;
    });
    if (!normalized) return allowed.slice(0, 5);
    return allowed.filter((item) => `${item.label} ${item.words}`.toLocaleLowerCase('es').includes(normalized));
  }, [query, user?.role, user?.permissions, preferences.enabledModules]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2 || !token) {
      setRecords([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const sources = [
        { endpoint: '/api/products', kind: 'Producto', label: (x: any) => x.name, detail: (x: any) => x.sku || x.category || 'Catálogo', href: (x: any) => `/products?search=${encodeURIComponent(x.name || '')}`, match: (x: any) => `${x.name} ${x.sku} ${x.brand} ${x.category}` },
        { endpoint: '/api/customers', kind: 'Cliente', label: (x: any) => x.name, detail: (x: any) => x.identification_number || x.phone || 'Cartera', href: () => '/customers', match: (x: any) => `${x.name} ${x.business_name} ${x.identification_number} ${x.phone}` },
        { endpoint: '/api/suppliers', kind: 'Proveedor', label: (x: any) => x.name, detail: (x: any) => x.country || x.city || 'Abastecimiento', href: () => '/suppliers', match: (x: any) => `${x.name} ${x.country} ${x.city} ${x.brand}` },
        { endpoint: '/api/sales', kind: 'Venta', label: (x: any) => x.sale_number, detail: (x: any) => x.customer_name || 'Punto de venta', href: (x: any) => `/sales/${x.id}`, match: (x: any) => `${x.sale_number} ${x.customer_name} ${x.status}` },
        { endpoint: '/api/imports', kind: 'Importación', label: (x: any) => x.bl_number || x.tracking_number || 'Embarque', detail: (x: any) => x.supplier_name || x.country || 'Logística', href: (x: any) => `/imports/${x.id}`, match: (x: any) => `${x.bl_number} ${x.tracking_number} ${x.supplier_name} ${x.country}` },
      ];

      const responses = await Promise.all(sources.map(async (source) => {
        try {
          const response = await fetch(source.endpoint, { headers, signal: controller.signal });
          if (!response.ok) return [];
          const data = await response.json();
          if (!Array.isArray(data)) return [];
          const lower = term.toLocaleLowerCase('es');
          return data.filter((item) => source.match(item).toLocaleLowerCase('es').includes(lower))
            .slice(0, 4)
            .map((item) => ({ label: source.label(item) || source.kind, detail: source.detail(item), href: source.href(item), kind: source.kind }));
        } catch {
          return [];
        }
      }));

      if (!controller.signal.aborted) {
        setRecords(responses.flat());
        setLoading(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, token]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="global-search-shell" ref={rootRef}>
      <Search size={18} aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
          if (event.key === 'Enter') {
            const firstResult = records[0];
            if (firstResult) { close(); router.push(firstResult.href); }
            else if (matchingShortcuts[0]) { close(); router.push(matchingShortcuts[0].href); }
          }
        }}
        placeholder="Buscar productos, clientes, ventas, importaciones..."
        aria-label="Buscar en todas las pantallas"
        aria-expanded={open}
        aria-controls="global-search-popover"
      />
      {query && <button className="global-search-clear" type="button" aria-label="Limpiar búsqueda" onClick={() => { setQuery(''); setOpen(true); inputRef.current?.focus(); }}><X size={16} /></button>}
      <kbd className="global-search-shortcut"><Command size={12} /> K</kbd>
      {open && (
        <div className="global-search-popover" id="global-search-popover" role="listbox" aria-label="Resultados de búsqueda">
          {matchingShortcuts.length > 0 && <p className="global-search-caption">MÓDULOS Y ACCESOS</p>}
          {matchingShortcuts.map((item) => (
            <button key={item.href} className="global-search-result" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { close(); router.push(item.href); }}>
              <span className="global-search-kind"><Command size={15} /></span>
              <span className="global-search-result-copy"><strong>{item.label}</strong><small>Ir a esta sección</small></span>
              <ArrowRight size={16} />
            </button>
          ))}
          {query.trim().length >= 2 && <p className="global-search-caption">REGISTROS</p>}
          {records.map((item, index) => (
            <Link key={`${item.kind}-${item.href}-${index}`} href={item.href} className="global-search-result" onMouseDown={(event) => event.preventDefault()} onClick={close}>
              <span className="global-search-record-kind">{item.kind.slice(0, 1)}</span>
              <span className="global-search-result-copy"><strong>{item.label}</strong><small>{item.kind} · {item.detail}</small></span>
              <ArrowRight size={16} />
            </Link>
          ))}
          {loading && <p className="global-search-empty">Buscando registros…</p>}
          {!loading && query.trim().length >= 2 && records.length === 0 && matchingShortcuts.length === 0 && <p className="global-search-empty">No encontramos resultados para “{query}”.</p>}
          {!query.trim() && <p className="global-search-hint">Busca en módulos y registros desde cualquier pantalla.</p>}
        </div>
      )}
    </div>
  );
}
