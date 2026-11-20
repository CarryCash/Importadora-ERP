'use client';

import { useRouter } from 'next/navigation';
import { BadgeDollarSign, CalendarDays, ClipboardList, MapPinned, PackageCheck, ShieldCheck, Truck, ChartNoAxesCombined } from 'lucide-react';

export type LogisticsSection = 'operations' | 'configuration' | 'receiving' | 'storage' | 'exports' | 'quality' | 'costs' | 'control' | 'docks';

const sections: { id: LogisticsSection; label: string; icon: typeof Truck }[] = [
  { id: 'operations', label: 'Operaciones', icon: Truck },
  { id: 'configuration', label: 'Configuración', icon: ClipboardList },
  { id: 'receiving', label: 'Recepción', icon: PackageCheck },
  { id: 'storage', label: 'Almacenamiento', icon: MapPinned },
  { id: 'exports', label: 'Exportaciones', icon: Truck },
  { id: 'quality', label: 'Calidad', icon: ShieldCheck },
  { id: 'costs', label: 'Costos y gastos', icon: BadgeDollarSign },
  { id: 'control', label: 'Control', icon: ChartNoAxesCombined },
  { id: 'docks', label: 'Citas y muelles', icon: CalendarDays },
];

export default function LogisticsModuleNav({ active, onSectionChange }: { active: LogisticsSection; onSectionChange?: (section: LogisticsSection) => void }) {
  const router = useRouter();
  const select = (section: LogisticsSection) => {
    if (section === 'operations' || section === 'configuration') {
      if (onSectionChange) onSectionChange(section);
      else router.push(`/logistics${section === 'configuration' ? '?view=configuration' : ''}`);
      return;
    }
    const routes:Record<LogisticsSection,string>={receiving:'/receiving',storage:'/storage',exports:'/logistics/exports',quality:'/logistics/quality',costs:'/logistics/costs',control:'/logistics/control',docks:'/logistics/docks',operations:'/logistics',configuration:'/logistics?view=configuration'};
    router.push(routes[section]);
  };

  return <nav className="logistics-module-nav" aria-label="Secciones del módulo de logística">
    {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} onClick={() => select(id)}><Icon size={16} />{label}</button>)}
  </nav>;
}
