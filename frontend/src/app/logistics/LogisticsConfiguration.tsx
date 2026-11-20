'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, Clock3, MapPin, Pencil, Plus, Save, Trash2, Warehouse, X } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';

type Field = { key: string; label: string; type?: 'number' | 'select' | 'checkbox' | 'date' | 'time'; options?: string[]; required?: boolean };
type Row = Record<string, string | number | boolean | null>;
type Section = { key: string; title: string; description: string; group: string; fields: Field[]; icon: typeof Warehouse };

const sections: Section[] = [
  { key: 'facilities', title: 'Centros, bodegas y sucursales', description: 'Registra instalaciones, su tipo y sus límites de capacidad.', group: 'Instalaciones', icon: Warehouse, fields: [
    { key: 'code', label: 'Código', required: true }, { key: 'name', label: 'Nombre', required: true },
    { key: 'kind', label: 'Tipo de instalación', type: 'select', options: ['Centro de distribución', 'Bodega', 'Sucursal', 'Punto de venta'] },
    { key: 'warehouseType', label: 'Tipo de bodega', type: 'select', options: ['Propia', 'Tercerizada', 'Tránsito', 'Cuarentena', 'Devoluciones'] },
    { key: 'address', label: 'Dirección' }, { key: 'city', label: 'Ciudad' }, { key: 'province', label: 'Provincia' },
    { key: 'maxVolumeM3', label: 'Capacidad (m³)', type: 'number' }, { key: 'maxWeightKg', label: 'Capacidad (kg)', type: 'number' },
    { key: 'maxUnits', label: 'Capacidad (unidades)', type: 'number' }, { key: 'maxPallets', label: 'Capacidad (pallets)', type: 'number' },
    { key: 'active', label: 'Activa', type: 'checkbox' },
  ] },
  { key: 'locations', title: 'Ubicaciones jerárquicas', description: 'Define la ruta física de almacenamiento dentro de cada instalación.', group: 'Instalaciones', icon: MapPin, fields: [
    { key: 'code', label: 'Código de ubicación', required: true }, { key: 'facilityCode', label: 'Código de bodega', required: true },
    { key: 'zone', label: 'Zona' }, { key: 'aisle', label: 'Pasillo' }, { key: 'rack', label: 'Estante' }, { key: 'level', label: 'Nivel' }, { key: 'position', label: 'Posición' },
    { key: 'maxWeightKg', label: 'Peso máximo (kg)', type: 'number' }, { key: 'compatibleWith', label: 'Compatibilidad / restricción' },
  ] },
  { key: 'docks', title: 'Muelles de recepción y despacho', description: 'Controla los puntos de carga, descarga y vehículos simultáneos.', group: 'Instalaciones', icon: ClipboardList, fields: [
    { key: 'code', label: 'Código', required: true }, { key: 'name', label: 'Nombre', required: true }, { key: 'facilityCode', label: 'Código de bodega' },
    { key: 'operation', label: 'Operación', type: 'select', options: ['Recepción', 'Despacho', 'Ambos'] }, { key: 'maxVehicles', label: 'Vehículos simultáneos', type: 'number' }, { key: 'active', label: 'Activo', type: 'checkbox' },
  ] },
  { key: 'handlingUnits', title: 'Unidades logísticas', description: 'Configura unidad, caja, bulto, pallet y contenedor.', group: 'Operación', icon: ClipboardList, fields: [
    { key: 'code', label: 'Código', required: true }, { key: 'name', label: 'Unidad', type: 'select', options: ['Unidad', 'Caja', 'Bulto', 'Pallet', 'Contenedor', 'Otra'] },
    { key: 'baseUnit', label: 'Unidad base' }, { key: 'quantity', label: 'Unidades base contenidas', type: 'number' }, { key: 'active', label: 'Activa', type: 'checkbox' },
  ] },
  { key: 'unitConversions', title: 'Conversiones de unidades', description: 'Define equivalencias para compras, almacenamiento y despacho.', group: 'Operación', icon: ClipboardList, fields: [
    { key: 'fromUnit', label: 'Desde', required: true }, { key: 'toUnit', label: 'Hacia', required: true }, { key: 'factor', label: 'Factor de conversión', type: 'number', required: true }, { key: 'description', label: 'Descripción' },
  ] },
  { key: 'storageRules', title: 'Almacenamiento y compatibilidad', description: 'Documenta zonas permitidas, pesos y productos compatibles.', group: 'Operación', icon: Warehouse, fields: [
    { key: 'name', label: 'Regla', required: true }, { key: 'category', label: 'Categoría / producto' }, { key: 'zone', label: 'Zona permitida' }, { key: 'maxWeightKg', label: 'Peso máximo (kg)', type: 'number' },
    { key: 'compatibleWith', label: 'Compatible con' }, { key: 'requirements', label: 'Requisitos de almacenamiento' },
  ] },
  { key: 'schedules', title: 'Calendarios y tiempos operativos', description: 'Registra horarios por instalación, días de operación y feriados.', group: 'Operación', icon: Clock3, fields: [
    { key: 'facilityCode', label: 'Código de instalación' }, { key: 'day', label: 'Día', type: 'select', options: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Feriado'] },
    { key: 'open', label: 'Apertura', type: 'time' }, { key: 'close', label: 'Cierre', type: 'time' }, { key: 'holidayDate', label: 'Fecha feriado', type: 'date' },
    { key: 'holidayName', label: 'Nombre del feriado' }, { key: 'processingMinutes', label: 'Tiempo operativo (min)', type: 'number' },
  ] },
  { key: 'serviceAreas', title: 'Zonas y áreas de cobertura', description: 'Define provincias, ciudades, direcciones y tiempos de atención.', group: 'Distribución', icon: MapPin, fields: [
    { key: 'name', label: 'Nombre de zona', required: true }, { key: 'country', label: 'País', }, { key: 'province', label: 'Provincia' }, { key: 'city', label: 'Ciudad' }, { key: 'postalCode', label: 'Código postal / sector' },
    { key: 'address', label: 'Dirección o límite de cobertura' }, { key: 'estimatedDays', label: 'Tiempo estimado (días)', type: 'number' }, { key: 'active', label: 'Activa', type: 'checkbox' },
  ] },
  { key: 'documentSeries', title: 'Numeración y prefijos', description: 'Configura series por tipo de documento logístico.', group: 'Distribución', icon: ClipboardList, fields: [
    { key: 'documentType', label: 'Documento', type: 'select', options: ['Orden de traslado', 'Guía de despacho', 'Recepción', 'Devolución', 'Otro'], required: true },
    { key: 'prefix', label: 'Prefijo', required: true }, { key: 'nextNumber', label: 'Siguiente número', type: 'number' }, { key: 'padding', label: 'Dígitos', type: 'number' }, { key: 'active', label: 'Activa', type: 'checkbox' },
  ] },
  { key: 'policies', title: 'Parámetros y políticas', description: 'Mantén reglas configurables para la operación logística.', group: 'Distribución', icon: ClipboardList, fields: [
    { key: 'key', label: 'Clave', required: true }, { key: 'name', label: 'Parámetro / política', required: true }, { key: 'value', label: 'Valor' }, { key: 'description', label: 'Descripción' }, { key: 'active', label: 'Activa', type: 'checkbox' },
  ] },
];

const emptyConfig = () => Object.fromEntries(sections.map((section) => [section.key, []])) as Record<string, Row[]>;

export default function LogisticsConfiguration() {
  const { token, user } = useAuth();
  const [configuration, setConfiguration] = useState<Record<string, Row[]>>(emptyConfig);
  const [group, setGroup] = useState('Instalaciones');
  const [editing, setEditing] = useState<{ section: Section; index: number | null; row: Row } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const canManage = user?.role === 'admin' || Boolean(user?.permissions?.includes('logistics.write'));
  const visibleSections = useMemo(() => sections.filter((section) => section.group === group), [group]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/logistics/configuration', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo cargar la configuración logística.');
        setConfiguration({ ...emptyConfig(), ...data });
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Error de conexión.'))
      .finally(() => setLoading(false));
  }, [token]);

  const persist = async (next: Record<string, Row[]>) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/logistics/configuration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar la configuración.');
      setConfiguration({ ...emptyConfig(), ...data.configuration });
      setMessage('Configuración guardada en PostgreSQL.');
      setEditing(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error de conexión.');
    } finally {
      setSaving(false);
    }
  };

  const saveRow = (section: Section, index: number | null, row: Row) => {
    const next = { ...configuration, [section.key]: [...(configuration[section.key] || [])] };
    if (index === null) next[section.key].push(row);
    else next[section.key][index] = row;
    void persist(next);
  };

  const removeRow = (section: Section, index: number) => {
    const next = { ...configuration, [section.key]: configuration[section.key].filter((_, rowIndex) => rowIndex !== index) };
    void persist(next);
  };

  if (loading) return <div className="logistics-config-loading">Cargando configuración logística…</div>;

  return <section className="logistics-config-page">
    <div className="logistics-config-intro"><div><p className="eyebrow">MAESTROS Y POLÍTICAS</p><h2>Configuración logística</h2><p>Administra instalaciones, almacenamiento, operación y distribución del negocio.</p></div><span className="logistics-config-count">{sections.reduce((sum, section) => sum + (configuration[section.key]?.length || 0), 0)} registros</span></div>
    <div className="logistics-config-tabs" role="tablist" aria-label="Grupos de configuración">
      {['Instalaciones', 'Operación', 'Distribución'].map((item) => <button type="button" role="tab" aria-selected={group === item} className={group === item ? 'active' : ''} key={item} onClick={() => setGroup(item)}>{item}</button>)}
    </div>
    <div className="logistics-config-grid">
      {visibleSections.map((section) => {
        const Icon = section.icon;
        const rows = configuration[section.key] || [];
        return <article className="logistics-config-card" key={section.key}>
          <header><span className="logistics-config-icon"><Icon size={18} /></span><div><h3>{section.title}</h3><p>{section.description}</p></div>{canManage && <button type="button" className="settings-primary-button logistics-add-button" onClick={() => setEditing({ section, index: null, row: Object.fromEntries(section.fields.map((field) => [field.key, field.type === 'checkbox' ? true : field.type === 'number' ? 0 : ''])) })}><Plus size={15} />Agregar</button>}</header>
          {rows.length === 0 ? <div className="logistics-config-empty">Aún no hay registros{canManage ? '. Usa “Agregar” para configurar esta sección.' : '.'}</div> : <div className="logistics-config-table-wrap"><table className="logistics-config-table"><thead><tr>{section.fields.map((field) => <th key={field.key}>{field.label}</th>)}{canManage && <th>Acciones</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row.code || row.key || row.name || row.prefix || index)}-${index}`}>{section.fields.map((field) => <td key={field.key}>{field.type === 'checkbox' ? row[field.key] ? 'Sí' : 'No' : String(row[field.key] ?? '—') || '—'}</td>)}{canManage && <td><div className="logistics-row-actions"><button type="button" aria-label={`Editar registro ${index + 1}`} onClick={() => setEditing({ section, index, row: { ...row } })}><Pencil size={15} /></button><button type="button" aria-label={`Eliminar registro ${index + 1}`} onClick={() => removeRow(section, index)}><Trash2 size={15} /></button></div></td>}</tr>)}</tbody></table></div>}
        </article>;
      })}
    </div>
    <p className={`logistics-config-message ${message && !message.includes('guardada') ? 'error' : ''}`} role="status">{message || 'Los catálogos se guardan por empresa. La aplicación automática de políticas requiere conectar cada regla con su flujo operativo.'}</p>

    {editing && <div className="logistics-config-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><form className="logistics-config-modal" onSubmit={(event) => { event.preventDefault(); saveRow(editing.section, editing.index, editing.row); }}>
      <header><div><p className="eyebrow">{editing.index === null ? 'NUEVO REGISTRO' : 'EDITAR REGISTRO'}</p><h3>{editing.section.title}</h3></div><button type="button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={19} /></button></header>
      <div className="logistics-config-fields">{editing.section.fields.map((field) => <label className={field.type === 'checkbox' ? 'logistics-checkbox-field' : ''} key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span>{field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(editing.row[field.key])} onChange={(event) => setEditing({ ...editing, row: { ...editing.row, [field.key]: event.target.checked } })} /> : field.type === 'select' ? <select required={field.required} value={String(editing.row[field.key] ?? '')} onChange={(event) => setEditing({ ...editing, row: { ...editing.row, [field.key]: event.target.value } })}><option value="">Selecciona…</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input required={field.required} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} value={String(editing.row[field.key] ?? '')} onChange={(event) => setEditing({ ...editing, row: { ...editing.row, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value } })} />}</label>)}</div>
      <footer><button type="button" className="settings-secondary-button" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="settings-primary-button" disabled={saving}><Save size={15} />{saving ? 'Guardando…' : 'Guardar registro'}</button></footer>
    </form></div>}
  </section>;
}
