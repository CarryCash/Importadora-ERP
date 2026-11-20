import Navbar from '../../components/Navbar';
import { ClipboardList, RotateCcw } from 'lucide-react';

const features: Record<string, { title: string; subtitle: string; items: string[]; icon: typeof RotateCcw }> = {
  returns: {
    title: 'Logística inversa y devoluciones',
    subtitle: 'Controla la devolución desde su autorización hasta su resolución final.',
    icon: RotateCcw,
    items: [
      'Devoluciones desde clientes', 'Devoluciones a proveedores', 'Autorización de devolución y motivo',
      'Recepción física de productos devueltos', 'Inspección del estado del producto',
      'Clasificación: vendible, reparable, cuarentena o desecho', 'Reingreso condicionado al inventario',
      'Reposición, reparación o disposición final', 'Trazabilidad al pedido y despacho original',
      'Costos de transporte de retorno', 'Gestión de garantías y reclamos',
      'Control de devoluciones pendientes de resolución',
    ],
  },
  inventory: {
    title: 'Inventarios y trazabilidad logística',
    subtitle: 'Consulta existencias y conserva el historial de cada movimiento y unidad.',
    icon: ClipboardList,
    items: [
      'Existencias por empresa, bodega y ubicación', 'Cantidad física, reservada, disponible y en tránsito',
      'Lotes, números de serie y vencimientos', 'Historial inalterable de movimientos registrados',
      'Conteos cíclicos y conteos generales', 'Ajustes con autorización y motivo',
      'Conciliación entre conteo y sistema', 'Diferencias de inventario y sus causas',
      'Estrategias FIFO, FEFO y otras políticas configurables', 'Trazabilidad hacia atrás y hacia adelante',
      'Bloqueo por calidad, daño, vencimiento o investigación', 'Consulta de dónde está cada unidad o lote',
      'Auditoría de usuarios, fechas y operaciones',
    ],
  },
};

export default function LogisticsFeaturePage({ kind }: { kind: 'returns' | 'inventory' }) {
  const page = features[kind];
  const Icon = page.icon;
  return <div className="logistics-layout"><Navbar /><main className="logistics-feature"><div className="logistics-feature-heading"><div className="logistics-feature-icon"><Icon size={24} /></div><div><p className="logistics-feature-eyebrow">LOGÍSTICA</p><h1>{page.title}</h1><p>{page.subtitle}</p></div></div><section className="logistics-feature-card"><header><div><h2>Funcionalidades</h2><p>{page.items.length} controles incluidos en esta sección</p></div><span>{page.items.length}</span></header><ol>{page.items.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ol></section></main><style jsx>{`
    .logistics-layout{min-height:100vh;background:var(--background)}.logistics-feature{max-width:1120px;margin:0 auto;padding:42px 24px 64px;color:var(--foreground)}
    .logistics-feature-heading{display:flex;align-items:center;gap:18px;margin-bottom:30px}.logistics-feature-icon{width:56px;height:56px;border-radius:16px;background:var(--secondary);display:grid;place-items:center;color:var(--foreground)}
    .logistics-feature-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.12em;color:var(--muted-foreground);margin:0 0 5px}.logistics-feature h1{font-size:clamp(1.7rem,3vw,2.25rem);margin:0;font-weight:800;letter-spacing:-.03em}.logistics-feature-heading p:last-child{color:var(--muted-foreground);margin:7px 0 0}
    .logistics-feature-card{background:var(--card);border:1px solid var(--border);border-radius:20px;overflow:hidden}.logistics-feature-card header{padding:22px 26px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.logistics-feature-card h2{font-size:1.1rem;margin:0}.logistics-feature-card header p{margin:5px 0 0;color:var(--muted-foreground);font-size:.9rem}.logistics-feature-card header>span{font-weight:800;border-radius:999px;background:var(--secondary);padding:7px 12px}
    .logistics-feature-card ol{list-style:none;padding:8px 26px 18px;margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:34px}.logistics-feature-card li{display:flex;align-items:center;gap:13px;padding:14px 0;border-bottom:1px solid var(--border);font-size:.94rem}.logistics-feature-card li span{font-size:.72rem;font-weight:800;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
    @media(max-width:680px){.logistics-feature{padding:28px 16px}.logistics-feature-card ol{grid-template-columns:1fr;padding:6px 18px 14px}.logistics-feature-card header{padding:18px}}
  `}</style></div>;
}
