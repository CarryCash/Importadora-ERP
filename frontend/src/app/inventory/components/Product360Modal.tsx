'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Warehouse as WarehouseIcon,
  MapPin,
  Barcode,
  Layers,
  History,
  Clock,
  BookmarkCheck,
  FileText,
  ShieldCheck,
  AlertCircle,
  TrendingDown,
  DollarSign,
} from 'lucide-react';

interface Product360Props {
  productId: string;
  onClose: () => void;
}

const API = '/api';

export default function Product360Modal({ productId, onClose }: Product360Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    | 'summary'
    | 'warehouses'
    | 'locations'
    | 'lots_serials'
    | 'movements'
    | 'kardex'
    | 'fifo'
    | 'reservations'
    | 'documents'
    | 'audit'
  >('summary');

  useEffect(() => {
    async function fetchProduct360() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/inventory/balances/product/${productId}`);
        if (!res.ok) throw new Error('Error al cargar la ficha del producto.');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Error de conexión');
      } finally {
        setLoading(false);
      }
    }
    fetchProduct360();
  }, [productId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-200 dark:border-slate-800">
          <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Cargando Ficha 360° del Producto...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 dark:border-red-900/40">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle size={24} />
            <h3 className="font-bold text-lg">Error al abrir ficha</h3>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">{error || 'No se encontró información'}</p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const { product, byWarehouse, byLocation, lots, serials, kardex, costLayers, reservations, relatedDocuments, audit } = data;

  const tabs = [
    { id: 'summary', label: '1. Resumen', icon: Package },
    { id: 'warehouses', label: '2. Por Bodega', icon: WarehouseIcon },
    { id: 'locations', label: '3. Por Ubicación', icon: MapPin },
    { id: 'lots_serials', label: '4. Lotes & Series', icon: Barcode },
    { id: 'movements', label: '5. Movimientos', icon: History },
    { id: 'kardex', label: '6. Kardex', icon: Clock },
    { id: 'fifo', label: '7. Capas FIFO', icon: Layers },
    { id: 'reservations', label: '8. Reservas', icon: BookmarkCheck },
    { id: 'documents', label: '9. Documentos', icon: FileText },
    { id: 'audit', label: '10. Auditoría', icon: ShieldCheck },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xl">
              <Package size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{product.name}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                  {product.sku}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-semibold uppercase">
                  Trazabilidad: {product.tracking_type || 'Sin seguimiento'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Categoría: {product.category_name || product.category || 'General'} • Marca: {product.brand_name || product.brand || 'N/A'} • ID: {product.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation (10 Pestañas Requeridas) */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/40 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 min-w-max py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/30 dark:bg-slate-900/30">
          {/* TAB 1: RESUMEN */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Físico</span>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {byWarehouse.reduce((acc: number, w: any) => acc + Number(w.physical_stock), 0)}
                  </p>
                  <span className="text-[11px] text-slate-400">Total en almacén</span>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Disponible Venta</span>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {byWarehouse.reduce((acc: number, w: any) => acc + Number(w.available_stock), 0)}
                  </p>
                  <span className="text-[11px] text-slate-400">Físico - Reservado - Bloqueado</span>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Reservado</span>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                    {byWarehouse.reduce((acc: number, w: any) => acc + Number(w.reserved_stock), 0)}
                  </p>
                  <span className="text-[11px] text-slate-400">Comprometido a pedidos</span>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">En Tránsito</span>
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                    {byWarehouse.reduce((acc: number, w: any) => acc + Number(w.in_transit_stock), 0)}
                  </p>
                  <span className="text-[11px] text-slate-400">Transferencias activas</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Layers size={18} className="text-emerald-600" />
                    Valoración Contable FIFO
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700/50 text-sm">
                      <span className="text-slate-500">Capas FIFO Activas:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{costLayers.filter((l: any) => l.status === 'active').length}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700/50 text-sm">
                      <span className="text-slate-500">Costo Unitario Ponderado FIFO:</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        ${costLayers.length > 0 ? (costLayers.reduce((acc: number, l: any) => acc + Number(l.remaining_quantity * l.functional_unit_cost), 0) / Math.max(1, costLayers.reduce((acc: number, l: any) => acc + Number(l.remaining_quantity), 0))).toFixed(4) : '0.0000'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 text-sm">
                      <span className="text-slate-500">Valor Total en Libros:</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-lg font-mono">
                        ${costLayers.reduce((acc: number, l: any) => acc + Number(l.remaining_quantity * l.functional_unit_cost), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <History size={18} className="text-blue-600" />
                    Parámetros Logísticos y Reposición
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700/50 text-sm">
                      <span className="text-slate-500">Stock Mínimo Autorizado:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{product.min_stock || 0} unidades</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-700/50 text-sm">
                      <span className="text-slate-500">Tiempo de Entrega (Lead Time):</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{product.lead_time_days || 0} días</span>
                    </div>
                    <div className="flex justify-between items-center py-2 text-sm">
                      <span className="text-slate-500">Política de Trazabilidad:</span>
                      <span className="font-bold text-slate-900 dark:text-white uppercase font-mono">{product.tracking_type}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXISTENCIAS POR BODEGA */}
          {activeTab === 'warehouses' && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">Bodega</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4 text-right">Físico</th>
                    <th className="p-4 text-right">Reservado</th>
                    <th className="p-4 text-right">Bloqueado</th>
                    <th className="p-4 text-right text-emerald-600">Disponible</th>
                    <th className="p-4 text-right text-blue-600">En Tránsito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {byWarehouse.map((w: any) => (
                    <tr key={w.warehouse_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{w.warehouse_name}</td>
                      <td className="p-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold capitalize">
                          {w.operating_type || 'Principal'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono font-semibold">{w.physical_stock}</td>
                      <td className="p-4 text-right font-mono text-amber-600">{w.reserved_stock}</td>
                      <td className="p-4 text-right font-mono text-red-500">{w.blocked_stock}</td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{w.available_stock}</td>
                      <td className="p-4 text-right font-mono text-blue-600">{w.in_transit_stock}</td>
                    </tr>
                  ))}
                  {byWarehouse.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">Sin existencias registradas en bodegas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: POR UBICACIÓN */}
          {activeTab === 'locations' && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">Código Ubicación</th>
                    <th className="p-4">Bodega</th>
                    <th className="p-4">Jerarquía (Z-P-E-N-P)</th>
                    <th className="p-4">Lote</th>
                    <th className="p-4 text-right">Físico</th>
                    <th className="p-4 text-right text-emerald-600">Disponible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {byLocation.map((loc: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">{loc.location_code}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">{loc.warehouse_name}</td>
                      <td className="p-4 text-xs text-slate-500">
                        {loc.zone || '-'}/{loc.aisle || '-'}/{loc.rack || '-'}/{loc.level || '-'}/{loc.position || '-'}
                      </td>
                      <td className="p-4 font-mono text-xs">{loc.lot_number || 'Sin lote'}</td>
                      <td className="p-4 text-right font-mono font-bold">{loc.physical_stock}</td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-600">{loc.available_stock}</td>
                    </tr>
                  ))}
                  {byLocation.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">Sin existencias asignadas a ubicaciones físicas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: LOTES Y SERIES */}
          {activeTab === 'lots_serials' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Lotes Registrados ({lots.length})</h4>
                <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                        <th className="p-4">N.º Lote</th>
                        <th className="p-4">Fabricación</th>
                        <th className="p-4">Vencimiento</th>
                        <th className="p-4 text-right">Cantidad Actual</th>
                        <th className="p-4 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {lots.map((l: any) => (
                        <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                          <td className="p-4 font-mono font-bold">{l.lot_number}</td>
                          <td className="p-4 text-xs text-slate-500">{l.manufacturing_date || '-'}</td>
                          <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{l.expiration_date || '-'}</td>
                          <td className="p-4 text-right font-mono font-bold">{l.current_quantity}</td>
                          <td className="p-4 text-center">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                              l.status === 'available' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                              l.status === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                            }`}>
                              {l.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {lots.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400">Sin lotes asociados.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Números de Serie ({serials.length})</h4>
                <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                        <th className="p-4">N.º Serie</th>
                        <th className="p-4">Bodega Actual</th>
                        <th className="p-4">Ubicación</th>
                        <th className="p-4 text-right">Costo Adquisición</th>
                        <th className="p-4 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {serials.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                          <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">{s.serial_number}</td>
                          <td className="p-4 text-slate-600 dark:text-slate-300">{s.warehouse_name || '-'}</td>
                          <td className="p-4 font-mono text-xs">{s.location_code || '-'}</td>
                          <td className="p-4 text-right font-mono font-semibold">${Number(s.acquisition_cost || 0).toFixed(2)}</td>
                          <td className="p-4 text-center">
                            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase">
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {serials.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400">Sin unidades serializadas registradas.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5 & 6: KARDEX & MOVIMIENTOS */}
          {(activeTab === 'kardex' || activeTab === 'movements') && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">Fecha</th>
                    <th className="p-4">N.º Movimiento</th>
                    <th className="p-4">Operación</th>
                    <th className="p-4 text-right text-emerald-600">Entrada</th>
                    <th className="p-4 text-right text-red-600">Salida</th>
                    <th className="p-4 text-right font-bold">Saldo</th>
                    <th className="p-4 text-right">Costo Unitario</th>
                    <th className="p-4">Confirmado Por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {kardex.map((k: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(k.movement_date).toLocaleDateString()} {new Date(k.movement_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 font-mono font-bold text-xs">{k.movement_number}</td>
                      <td className="p-4">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 font-semibold capitalize">
                          {k.operation_type}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-600 font-bold">{k.quantity_in > 0 ? `+${k.quantity_in}` : '-'}</td>
                      <td className="p-4 text-right font-mono text-red-600 font-bold">{k.quantity_out > 0 ? `-${k.quantity_out}` : '-'}</td>
                      <td className="p-4 text-right font-mono font-black text-slate-900 dark:text-white">{k.running_balance}</td>
                      <td className="p-4 text-right font-mono font-semibold">${Number(k.unit_cost || 0).toFixed(4)}</td>
                      <td className="p-4 text-xs text-slate-500">{k.confirmed_by_user || 'Sistema'}</td>
                    </tr>
                  ))}
                  {kardex.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">Sin movimientos registrados en Kardex.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 7: CAPAS FIFO */}
          {activeTab === 'fifo' && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">Fecha Entrada</th>
                    <th className="p-4">Origen</th>
                    <th className="p-4 text-right">Cant. Inicial</th>
                    <th className="p-4 text-right font-bold text-emerald-600">Cant. Restante</th>
                    <th className="p-4 text-right">Costo Unitario FIFO</th>
                    <th className="p-4 text-right font-bold">Saldo Valorizado</th>
                    <th className="p-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {costLayers.map((l: any) => (
                    <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(l.effective_date).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-xs font-medium uppercase text-slate-600 dark:text-slate-300">{l.origin_doc_type}</td>
                      <td className="p-4 text-right font-mono">{l.initial_quantity}</td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{l.remaining_quantity}</td>
                      <td className="p-4 text-right font-mono font-semibold">${Number(l.functional_unit_cost).toFixed(4)}</td>
                      <td className="p-4 text-right font-mono font-black">
                        ${(Number(l.remaining_quantity) * Number(l.functional_unit_cost)).toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                          l.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                          'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {costLayers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">Sin capas de costo FIFO registradas para este producto.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 8: RESERVAS */}
          {activeTab === 'reservations' && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">N.º Reserva</th>
                    <th className="p-4">Origen</th>
                    <th className="p-4">Bodega</th>
                    <th className="p-4 text-right">Cantidad Reservada</th>
                    <th className="p-4 text-right">Atendida</th>
                    <th className="p-4">Vencimiento Reserva</th>
                    <th className="p-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {reservations.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 font-mono font-bold">{r.reservation_number}</td>
                      <td className="p-4 text-xs capitalize">{r.source_doc_type}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">{r.warehouse_name}</td>
                      <td className="p-4 text-right font-mono font-bold text-amber-600">{r.quantity}</td>
                      <td className="p-4 text-right font-mono">{r.fulfilled_quantity}</td>
                      <td className="p-4 text-xs text-slate-500">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : 'Sin expiración'}</td>
                      <td className="p-4 text-center">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold uppercase">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {reservations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">No existen reservas activas sobre este producto.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 9: DOCUMENTOS RELACIONADOS */}
          {activeTab === 'documents' && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">N.º Documento</th>
                    <th className="p-4">Tipo Operación</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4 text-right">Cantidad</th>
                    <th className="p-4 text-right">Costo Total</th>
                    <th className="p-4">Ref. Externa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {relatedDocuments.map((doc: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 font-mono font-bold">{doc.movement_number}</td>
                      <td className="p-4 text-xs capitalize">{doc.operation_type}</td>
                      <td className="p-4 text-xs text-slate-500">{new Date(doc.confirmed_at).toLocaleDateString()}</td>
                      <td className="p-4 text-right font-mono font-bold">{doc.quantity}</td>
                      <td className="p-4 text-right font-mono font-semibold">${Number(doc.total_cost || 0).toFixed(2)}</td>
                      <td className="p-4 text-xs text-slate-500">{doc.reference_doc_type || 'N/A'}</td>
                    </tr>
                  ))}
                  {relatedDocuments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">Sin documentos vinculados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 10: AUDITORÍA INMUTABLE */}
          {activeTab === 'audit' && (
            <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 uppercase">
                    <th className="p-4">Fecha y Hora</th>
                    <th className="p-4">Usuario</th>
                    <th className="p-4">Acción</th>
                    <th className="p-4">Motivo / Justificación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {audit.map((a: any) => (
                    <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{a.full_name || a.username || 'Sistema'}</td>
                      <td className="p-4">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 font-bold uppercase">
                          {a.action}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-600 dark:text-slate-400">{a.reason || 'Sin justificación registrada'}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">Sin eventos de auditoría registrados para este producto.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:opacity-90 transition shadow-sm"
          >
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
}

