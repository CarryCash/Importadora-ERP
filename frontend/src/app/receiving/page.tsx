'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCheck, FilePlus2, PackageCheck, Plus, RefreshCw, Truck, Upload, X } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';
import { getIdempotencyRequest } from '../../lib/idempotency';

type Option = { id: string; name?: string; code?: string; sku?: string; label?: string; [key: string]: any };
type ReceiptItem = { id: string; product_id: string; product_name: string; sku?: string; expected_quantity: number; received_quantity: number; damaged_quantity: number; missing_quantity: number; surplus_quantity: number; barcode?: string; batch_number?: string; expiration_date?: string; quality_status: string; quality_notes?: string; temporary_location?: string; quarantine: boolean; serial_numbers?: string[] };
type Receipt = { id: string; receipt_number: string; source_type: string; status: string; supplier_name?: string; target_warehouse_name: string; carrier_name?: string; vehicle_plate?: string; arrived_at?: string; unloaded_at?: string; notes?: string; items: ReceiptItem[]; evidence: any[] };
type PurchaseUnit = {id:string;unit_code:string;name:string;is_base:boolean;precision_scale:number;conversion_factor:number};
type ProductLine = { product_id: string; quantity: number; unit_cost: number; unit_id?:string; units?:PurchaseUnit[] };

const sourceNames: Record<string, string> = { purchase_order: 'Orden de compra', import: 'Importación', transfer: 'Transferencia interna', manual: 'Sin documento de origen' };
const qualityNames: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', hold: 'Retener / cuarentena' };

export default function ReceivingPage() {
  const { token, user } = useAuth();
  const canCreate = user?.role === 'admin' || Boolean(user?.permissions?.includes('receiving.create'));
  const canClose = user?.role === 'admin' || Boolean(user?.permissions?.includes('receiving.close'));
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [sources, setSources] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceType, setSourceType] = useState('purchase_order');
  const [sourceId, setSourceId] = useState('');
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [detail, setDetail] = useState<Receipt | null>(null);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [originWarehouseId, setOriginWarehouseId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [arrivedAt, setArrivedAt] = useState('');
  const [unloadedAt, setUnloadedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [manualLines, setManualLines] = useState<ProductLine[]>([{ product_id: '', quantity: 1, unit_cost: 0 }]);
  const [orderLines, setOrderLines] = useState<ProductLine[]>([{ product_id: '', quantity: 1, unit_cost: 0, units:[] }]);
  const [orderExpectedDate, setOrderExpectedDate] = useState('');
  const [transferLines, setTransferLines] = useState<{ inventory_id: string; quantity: number }[]>([{ inventory_id: '', quantity: 1 }]);
  const [inventoryRows, setInventoryRows] = useState<Option[]>([]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const idem=getIdempotencyRequest(path,init?.method||'GET',init?.body);
    const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(idem?{'Idempotency-Key':idem.key}:{}), ...(init?.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'No se pudo completar la operación.');
    idem?.complete();
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [receiptData, orderData, supplierData, productData, warehouseData, inventoryData] = await Promise.all([
        request('/api/receiving'), request('/api/receiving/purchase-orders'), request('/api/suppliers'),
        request('/api/products'), request('/api/inventory/warehouses'), request('/api/inventory?limit=100'),
      ]);
      setReceipts(receiptData);
      setPurchaseOrders(orderData);
      setSuppliers(supplierData);
      setProducts(productData);
      setWarehouses(warehouseData);
      setInventoryRows(Array.isArray(inventoryData?.data) ? inventoryData.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la recepción.');
    } finally { setLoading(false); }
  }, [request, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get('source_type');
    const requestedId = params.get('source_id');
    if (requestedType === 'import' && requestedId) {
      setSourceType('import');
      setSourceId(requestedId);
      setShowReceiptForm(true);
    }
  }, []);

  useEffect(() => {
    if (!showReceiptForm || sourceType === 'manual') { setSources([]); return; }
    request(`/api/receiving/sources?type=${sourceType}`).then(setSources).catch((loadError) => setError(loadError.message));
  }, [request, showReceiptForm, sourceType]);

  const openNewReceipt = () => {
    setSourceType('purchase_order'); setSourceId(''); setSupplierId(''); setTargetWarehouseId(''); setOriginWarehouseId(''); setCarrier('');
    setVehiclePlate(''); setArrivedAt(''); setUnloadedAt(''); setNotes(''); setManualLines([{ product_id: '', quantity: 1, unit_cost: 0 }]); setShowReceiptForm(true);
  };

  const openDetail = async (id: string) => {
    try { setDetail(await request(`/api/receiving/${id}`)); }
    catch (detailError) { setError(detailError instanceof Error ? detailError.message : 'No se pudo abrir la recepción.'); }
  };

  const createReceipt = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const body: any = { source_type: sourceType, source_id: sourceId || undefined, supplier_id: supplierId || undefined,
        target_warehouse_id: targetWarehouseId, origin_warehouse_id: originWarehouseId || undefined, carrier_name: carrier,
        vehicle_plate: vehiclePlate, arrived_at: arrivedAt || undefined, unloaded_at: unloadedAt || undefined, notes };
      if (sourceType === 'manual') body.items = manualLines.map((line) => ({ product_id: line.product_id, expected_quantity: Number(line.quantity), unit_cost: Number(line.unit_cost) }));
      const receipt = await request('/api/receiving', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setShowReceiptForm(false); setNotice(`Recepción ${receipt.receipt_number} creada.`); await refresh(); await openDetail(receipt.id);
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'No se pudo crear la recepción.'); }
    finally { setSaving(false); }
  };

  const createPurchaseOrder = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const order = await request('/api/receiving/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, expected_date: orderExpectedDate || null, notes, items: orderLines.map((line) => ({ product_id:line.product_id,unit_id:line.unit_id||null,quantity:Number(line.quantity),unit_cost:Number(line.unit_cost) })) }) });
      setShowOrderForm(false); setNotice(`Orden ${order.order_number} creada y disponible para recepción.`); await refresh();
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'No se pudo crear la orden.'); }
    finally { setSaving(false); }
  };

  const createTransfer = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const transfer = await request('/api/receiving/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin_warehouse_id: originWarehouseId, target_warehouse_id: targetWarehouseId, notes, items: transferLines.map((line) => ({ ...line, quantity: Number(line.quantity) })) }) });
      setShowTransferForm(false); setNotice(`Transferencia ${transfer.transfer_number} despachada a tránsito.`); await refresh();
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'No se pudo despachar la transferencia.'); }
    finally { setSaving(false); }
  };

  const saveItem = async (item: ReceiptItem) => {
    try {
      const updated = await request(`/api/receiving/${detail?.id}/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, received_quantity: Number(item.received_quantity), damaged_quantity: Number(item.damaged_quantity), serial_numbers: typeof item.serial_numbers === 'string' ? (item.serial_numbers as any).split(',').map((x: string) => x.trim()).filter(Boolean) : item.serial_numbers }) });
      setDetail(updated); setNotice('Inspección de línea guardada.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la línea.'); }
  };

  const saveDetails = async () => {
    if (!detail) return;
    try {
      const updated = await request(`/api/receiving/${detail.id}/details`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detail) });
      setDetail(updated); setNotice('Datos de llegada y descarga guardados.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los datos.'); }
  };

  const uploadEvidence = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !detail) return;
    if (file.size > 1024 * 1024) { setError('La evidencia debe pesar hasta 1 MB.'); event.target.value = ''; return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No se pudo leer el archivo.')); reader.readAsDataURL(file); });
    try {
      await request(`/api/receiving/${detail.id}/evidence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: file.name, mime_type: file.type, data_url: dataUrl }) });
      await openDetail(detail.id); setNotice('Evidencia adjuntada a la recepción.');
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'No se pudo adjuntar el archivo.'); }
    event.target.value = '';
  };

  const closeReceipt = async () => {
    if (!detail || !window.confirm(`¿Cerrar ${detail.receipt_number} y generar su movimiento de inventario?`)) return;
    try { const closed = await request(`/api/receiving/${detail.id}/close`, { method: 'POST' }); setDetail(closed); setNotice('Recepción cerrada; los movimientos de inventario fueron generados.'); await refresh(); }
    catch (closeError) { setError(closeError instanceof Error ? closeError.message : 'No se pudo cerrar la recepción.'); }
  };

  const updateDetailItem = (id: string, patch: Partial<ReceiptItem>) => setDetail((current) => current ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) } : current);
  const addLine = (setter: (fn: (rows: any[]) => any[]) => void) => setter((rows) => [...rows, { product_id: '', quantity: 1, unit_cost: 0, units:[] }]);
  const selectOrderProduct=async(index:number,productId:string)=>{let units:PurchaseUnit[]=[];try{const data=await request(`/api/products/${productId}/units`);const all=data.units||[],conversions=data.conversions||[],today=new Date().toISOString().slice(0,10),base=all.find((u:any)=>u.is_base);units=all.filter((u:any)=>u.is_base||conversions.some((c:any)=>c.from_unit_id===u.id&&c.to_unit_id===base?.id&&c.status==='approved'&&String(c.valid_from).slice(0,10)<=today&&(!c.valid_until||String(c.valid_until).slice(0,10)>=today))).map((u:any)=>({...u,conversion_factor:u.is_base?1:Number(conversions.find((c:any)=>c.from_unit_id===u.id&&c.to_unit_id===base?.id&&c.status==='approved'&&String(c.valid_from).slice(0,10)<=today&&(!c.valid_until||String(c.valid_until).slice(0,10)>=today))?.factor||1)}));}catch{}setOrderLines(rows=>rows.map((row,i)=>i===index?{...row,product_id:productId,units,unit_id:units.find(u=>u.is_base)?.id||units[0]?.id}:row));};
  const productsAndSuppliersReady = products.length > 0 && suppliers.length > 0;

  return <div className="dashboard-layout"><Navbar /><main className="dashboard-content receiving-page">
    <header className="receiving-heading"><div><p className="eyebrow">ABASTECIMIENTO Y BODEGA</p><h1>Recepción de mercancías</h1><p>Verifica cada entrega, documenta incidencias y registra existencias con trazabilidad.</p></div><button type="button" className="settings-secondary-button" onClick={() => void refresh()}><RefreshCw size={15} />Actualizar</button></header>
    <section className="receiving-metrics"><div><span>Órdenes abiertas</span><strong>{purchaseOrders.filter((order) => ['approved','partial'].includes(order.status)).length}</strong></div><div><span>Recepciones</span><strong>{receipts.length}</strong></div><div><span>En proceso</span><strong>{receipts.filter((receipt) => receipt.status !== 'closed').length}</strong></div><div><span>Cerradas</span><strong>{receipts.filter((receipt) => receipt.status === 'closed').length}</strong></div></section>
    <section className="receiving-section"><header className="receiving-section-heading"><div><h2>Documentos de abastecimiento</h2><p>Las órdenes aprobadas y las importaciones generan recepciones parciales o múltiples.</p></div>{canCreate && <div className="receiving-actions"><button type="button" className="settings-secondary-button" onClick={() => { setSupplierId(''); setOrderLines([{ product_id: '', quantity: 1, unit_cost: 0 }]); setOrderExpectedDate(''); setNotes(''); setShowOrderForm(true); }}><FilePlus2 size={16} />Nueva orden</button><button type="button" className="settings-primary-button" onClick={openNewReceipt}><Plus size={16} />Nueva recepción</button></div>}</header>
      {purchaseOrders.length === 0 ? <div className="receiving-empty">No hay órdenes de compra. Crea una para planificar lo esperado y recibir parcial o totalmente.</div> : <div className="receiving-order-grid">{purchaseOrders.map((order) => <article key={order.id}><div><span className={`receiving-status ${order.status}`}>{order.status === 'partial' ? 'Parcial' : order.status === 'received' ? 'Recibida' : order.status === 'cancelled' ? 'Cancelada' : 'Aprobada'}</span><strong>{order.order_number}</strong></div><p>{order.supplier_name} · {order.items?.length || 0} líneas</p><small>{order.expected_date ? `Esperada ${new Date(order.expected_date).toLocaleDateString('es-EC')}` : 'Sin fecha esperada'}</small></article>)}</div>}
    </section>

    <section className="receiving-section"><header className="receiving-section-heading"><div><h2>Historial de recepciones</h2><p>Seguimiento de cantidades, inspecciones y cierre de inventario.</p></div></header>{loading ? <div className="receiving-empty">Cargando recepciones…</div> : receipts.length === 0 ? <div className="receiving-empty">Todavía no existen recepciones registradas.</div> : <div className="receiving-table-wrap"><table className="receiving-table"><thead><tr><th>Recepción</th><th>Origen</th><th>Proveedor</th><th>Bodega destino</th><th>Llegada</th><th>Estado</th><th></th></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id}><td><strong>{receipt.receipt_number}</strong></td><td>{sourceNames[receipt.source_type] || receipt.source_type}</td><td>{receipt.supplier_name || '—'}</td><td>{receipt.target_warehouse_name}</td><td>{receipt.arrived_at ? new Date(receipt.arrived_at).toLocaleString('es-EC') : 'Pendiente'}</td><td><span className={`receiving-status ${receipt.status}`}>{receipt.status === 'closed' ? 'Cerrada' : receipt.status === 'inspection' ? 'En inspección' : 'En proceso'}</span></td><td><button type="button" className="receiving-open-button" onClick={() => void openDetail(receipt.id)}>{receipt.status === 'closed' ? 'Ver detalle' : 'Continuar'}</button></td></tr>)}</tbody></table></div>}</section>
    {(error || notice) && <p className={`receiving-toast ${error ? 'error' : ''}`} role="status">{error || notice}<button type="button" aria-label="Cerrar aviso" onClick={() => { setError(''); setNotice(''); }}><X size={14} /></button></p>}
  </main>

  {showReceiptForm && <div className="receiving-overlay"><form className="receiving-modal" onSubmit={createReceipt}><header><div><p className="eyebrow">NUEVA ENTRADA</p><h2>Crear recepción</h2></div><button type="button" onClick={() => setShowReceiptForm(false)} aria-label="Cerrar"><X size={18} /></button></header><div className="receiving-form-grid">
    <label><span>Origen de la mercancía</span><select value={sourceType} onChange={(event) => { setSourceType(event.target.value); setSourceId(''); }}><option value="purchase_order">Orden de compra</option><option value="import">Importación</option><option value="transfer">Transferencia interna</option><option value="manual">Ingreso manual</option></select></label>
    {sourceType !== 'manual' && <label><span>Documento pendiente</span><select value={sourceId} onChange={(event) => { setSourceId(event.target.value); const selected=sources.find((source)=>source.id===event.target.value); if(sourceType==='transfer'&&selected?.target_warehouse_id)setTargetWarehouseId(selected.target_warehouse_id); }} required><option value="">Selecciona documento…</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.label} · {source.supplier_name || `${source.origin_name || ''} → ${source.target_name || ''}`}</option>)}</select>{sources.length === 0 && <small>No hay documentos pendientes de este tipo.</small>}</label>}
    {sourceType === 'manual' && <label><span>Proveedor (opcional)</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecciona proveedor…</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>}
    <label><span>Bodega de destino</span><select value={targetWarehouseId} onChange={(event) => setTargetWarehouseId(event.target.value)} required><option value="">Selecciona bodega…</option>{warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name} · {warehouse.code}</option>)}</select></label>
    {sourceType === 'transfer' && <label><span>Bodega de origen</span><select value={originWarehouseId} onChange={(event) => setOriginWarehouseId(event.target.value)}><option value="">La define la transferencia seleccionada</option>{warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>}
    <label><span>Transportista</span><input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Empresa o persona" /></label><label><span>Vehículo / placa</span><input value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} placeholder="ABC-1234" /></label>
    <label><span>Fecha y hora de llegada</span><input type="datetime-local" value={arrivedAt} onChange={(event) => setArrivedAt(event.target.value)} /></label><label><span>Fecha y hora de descarga</span><input type="datetime-local" value={unloadedAt} onChange={(event) => setUnloadedAt(event.target.value)} /></label>
    {sourceType === 'manual' && <div className="receiving-lines-field"><div className="receiving-lines-heading"><strong>Productos esperados</strong><button type="button" onClick={() => addLine(setManualLines)}><Plus size={14} />Agregar línea</button></div>{manualLines.map((line,index) => <div className="receiving-composer-line" key={index}><select aria-label="Producto" value={line.product_id} onChange={(event) => setManualLines((rows) => rows.map((row,i) => i===index?{...row,product_id:event.target.value}:row))}><option value="">Producto…</option>{products.map((product)=><option key={product.id} value={product.id}>{product.name} {product.sku?`· ${product.sku}`:''}</option>)}</select><input aria-label="Cantidad esperada" type="number" min="1" value={line.quantity} onChange={(event)=>setManualLines((rows)=>rows.map((row,i)=>i===index?{...row,quantity:Number(event.target.value)}:row))}/><button type="button" aria-label="Quitar línea" onClick={()=>setManualLines((rows)=>rows.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div>}
    <label className="receiving-form-full"><span>Observaciones</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Novedades del transporte o descarga" /></label>
    {!productsAndSuppliersReady && <small className="receiving-form-full">Necesitas productos y proveedores configurados para crear órdenes o ingresos manuales.</small>}
  </div><footer><button type="button" className="settings-secondary-button" onClick={() => setShowReceiptForm(false)}>Cancelar</button><button className="settings-primary-button" type="submit" disabled={saving || !targetWarehouseId || (sourceType!=='manual' && !sourceId)}><Plus size={15}/>{saving?'Creando…':'Crear recepción'}</button></footer></form></div>}

  {showOrderForm && <div className="receiving-overlay"><form className="receiving-modal" onSubmit={createPurchaseOrder}><header><div><p className="eyebrow">ABASTECIMIENTO</p><h2>Nueva orden de compra</h2></div><button type="button" onClick={() => setShowOrderForm(false)} aria-label="Cerrar"><X size={18}/></button></header><div className="receiving-form-grid"><label><span>Proveedor</span><select value={supplierId} onChange={(event)=>setSupplierId(event.target.value)} required><option value="">Selecciona proveedor…</option>{suppliers.map((supplier)=><option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label><span>Fecha prevista</span><input type="date" value={orderExpectedDate} onChange={(event)=>setOrderExpectedDate(event.target.value)}/></label><div className="receiving-lines-field"><div className="receiving-lines-heading"><strong>Líneas de compra</strong><button type="button" onClick={()=>addLine(setOrderLines)}><Plus size={14}/>Agregar línea</button></div>{orderLines.map((line,index)=><div className="receiving-composer-line three" key={index}><select aria-label="Producto" value={line.product_id} onChange={(event)=>void selectOrderProduct(index,event.target.value)}><option value="">Producto…</option>{products.map((product)=><option key={product.id} value={product.id}>{product.name} {product.sku?`· ${product.sku}`:''}</option>)}</select><select aria-label="Unidad de compra" value={line.unit_id||''} onChange={(event)=>setOrderLines(rows=>rows.map((row,i)=>i===index?{...row,unit_id:event.target.value}:row))} disabled={!line.units?.length}><option value="">unidad base</option>{(line.units||[]).map(unit=><option key={unit.id} value={unit.id}>{unit.name} · {unit.unit_code}</option>)}</select><input aria-label="Cantidad en unidad seleccionada" type="number" min="0.000001" step={line.units?.find(unit=>unit.id===line.unit_id)?.precision_scale?`0.${'0'.repeat(Math.max(0,line.units.find(unit=>unit.id===line.unit_id)!.precision_scale-1))}1`:'1'} value={line.quantity} onChange={(event)=>setOrderLines(rows=>rows.map((row,i)=>i===index?{...row,quantity:Number(event.target.value)}:row))}/><input aria-label="Costo por unidad seleccionada" type="number" min="0" step="0.0001" value={line.unit_cost} onChange={(event)=>setOrderLines(rows=>rows.map((row,i)=>i===index?{...row,unit_cost:Number(event.target.value)}:row))}/><button type="button" aria-label="Quitar línea" onClick={()=>setOrderLines((rows)=>rows.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div><label className="receiving-form-full"><span>Notas</span><textarea value={notes} onChange={(event)=>setNotes(event.target.value)} rows={2}/></label></div><footer><button type="button" className="settings-secondary-button" onClick={()=>setShowOrderForm(false)}>Cancelar</button><button type="submit" className="settings-primary-button" disabled={saving || !productsAndSuppliersReady}><FilePlus2 size={15}/>{saving?'Guardando…':'Crear orden'}</button></footer></form></div>}

  {showTransferForm && <div className="receiving-overlay"><form className="receiving-modal" onSubmit={createTransfer}><header><div><p className="eyebrow">MOVIMIENTO INTERNO</p><h2>Despachar transferencia</h2></div><button type="button" onClick={()=>setShowTransferForm(false)} aria-label="Cerrar"><X size={18}/></button></header><div className="receiving-form-grid"><label><span>Bodega de origen</span><select value={originWarehouseId} onChange={(event)=>setOriginWarehouseId(event.target.value)} required><option value="">Selecciona origen…</option>{warehouses.map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label><span>Bodega de destino</span><select value={targetWarehouseId} onChange={(event)=>setTargetWarehouseId(event.target.value)} required><option value="">Selecciona destino…</option>{warehouses.filter((warehouse)=>warehouse.id!==originWarehouseId).map((warehouse)=><option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><div className="receiving-lines-field"><div className="receiving-lines-heading"><strong>Existencias a despachar</strong><button type="button" onClick={()=>setTransferLines((rows)=>[...rows,{inventory_id:'',quantity:1}])}><Plus size={14}/>Agregar línea</button></div>{transferLines.map((line,index)=><div className="receiving-composer-line" key={index}><select aria-label="Existencia" value={line.inventory_id} onChange={(event)=>setTransferLines((rows)=>rows.map((row,i)=>i===index?{...row,inventory_id:event.target.value}:row))}><option value="">Producto / lote…</option>{inventoryRows.filter((item)=>item.warehouse_id===originWarehouseId).map((item)=><option key={item.inventory_id} value={item.inventory_id}>{item.product_name} · {item.sku} · lote {item.batch_number} · disponible {item.quantity}</option>)}</select><input aria-label="Cantidad a transferir" type="number" min="1" value={line.quantity} onChange={(event)=>setTransferLines((rows)=>rows.map((row,i)=>i===index?{...row,quantity:Number(event.target.value)}:row))}/><button type="button" onClick={()=>setTransferLines((rows)=>rows.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div><label className="receiving-form-full"><span>Notas</span><textarea value={notes} onChange={(event)=>setNotes(event.target.value)} rows={2}/></label></div><footer><button type="button" className="settings-secondary-button" onClick={()=>setShowTransferForm(false)}>Cancelar</button><button type="submit" className="settings-primary-button" disabled={saving || !originWarehouseId || !targetWarehouseId}><Truck size={15}/>{saving?'Despachando…':'Enviar a tránsito'}</button></footer></form></div>}

  {detail && <div className="receiving-overlay"><section className="receiving-modal receiving-detail-modal"><header><div><p className="eyebrow">{sourceNames[detail.source_type]}</p><h2>{detail.receipt_number}</h2><span className={`receiving-status ${detail.status}`}>{detail.status==='closed'?'Cerrada':detail.status==='inspection'?'En inspección':'En proceso'}</span></div><button type="button" onClick={()=>setDetail(null)} aria-label="Cerrar"><X size={18}/></button></header>
    <div className="receiving-detail-content"><div className="receiving-form-grid detail-meta"><label><span>Transportista</span><input disabled={detail.status==='closed'} value={detail.carrier_name||''} onChange={(event)=>setDetail({...detail,carrier_name:event.target.value})}/></label><label><span>Vehículo / placa</span><input disabled={detail.status==='closed'} value={detail.vehicle_plate||''} onChange={(event)=>setDetail({...detail,vehicle_plate:event.target.value})}/></label><label><span>Llegada</span><input disabled={detail.status==='closed'} type="datetime-local" value={detail.arrived_at?new Date(detail.arrived_at).toISOString().slice(0,16):''} onChange={(event)=>setDetail({...detail,arrived_at:event.target.value})}/></label><label><span>Descarga</span><input disabled={detail.status==='closed'} type="datetime-local" value={detail.unloaded_at?new Date(detail.unloaded_at).toISOString().slice(0,16):''} onChange={(event)=>setDetail({...detail,unloaded_at:event.target.value})}/></label><label className="receiving-form-full"><span>Observaciones de recepción</span><textarea disabled={detail.status==='closed'} value={detail.notes||''} rows={2} onChange={(event)=>setDetail({...detail,notes:event.target.value})}/></label></div>
      <div className="receiving-detail-items">{detail.items.map((item)=> <article className="receiving-item-card" key={item.id}><header><div><strong>{item.product_name}</strong><small>{item.sku||'Sin SKU'} · Esperado {item.expected_quantity} · Recibido {item.received_quantity} · Faltante {item.missing_quantity} · Sobrante {item.surplus_quantity}</small></div>{detail.status!=='closed' && <button type="button" className="receiving-open-button" onClick={()=>void saveItem(item)}><Check size={14}/>Guardar línea</button>}</header><div className="receiving-item-fields"><label><span>Código de barras</span><input disabled={detail.status==='closed'} value={item.barcode||''} onChange={(event)=>updateDetailItem(item.id,{barcode:event.target.value})} placeholder="Escanear o ingresar" /></label><label><span>Cantidad recibida</span><input disabled={detail.status==='closed'} type="number" min="0" value={item.received_quantity} onChange={(event)=>updateDetailItem(item.id,{received_quantity:Number(event.target.value)})}/></label><label><span>Dañados</span><input disabled={detail.status==='closed'} type="number" min="0" value={item.damaged_quantity} onChange={(event)=>updateDetailItem(item.id,{damaged_quantity:Number(event.target.value)})}/></label><label><span>Lote / serie</span><input disabled={detail.status==='closed'} value={item.batch_number||''} onChange={(event)=>updateDetailItem(item.id,{batch_number:event.target.value})}/></label><label><span>Caducidad</span><input disabled={detail.status==='closed'} type="date" value={item.expiration_date?.slice(0,10)||''} onChange={(event)=>updateDetailItem(item.id,{expiration_date:event.target.value})}/></label><label><span>Inspección de calidad</span><select disabled={detail.status==='closed'} value={item.quality_status} onChange={(event)=>updateDetailItem(item.id,{quality_status:event.target.value})}>{Object.entries(qualityNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>Ubicación temporal</span><input disabled={detail.status==='closed'} value={item.temporary_location||''} onChange={(event)=>updateDetailItem(item.id,{temporary_location:event.target.value})}/></label><label><span>Números de serie (separados por coma)</span><input disabled={detail.status==='closed'} value={Array.isArray(item.serial_numbers)?item.serial_numbers.join(', '):String(item.serial_numbers||'')} onChange={(event)=>updateDetailItem(item.id,{serial_numbers:event.target.value as any})}/></label><label className="receiving-quarantine"><input disabled={detail.status==='closed'} type="checkbox" checked={Boolean(item.quarantine)} onChange={(event)=>updateDetailItem(item.id,{quarantine:event.target.checked})}/><span>Enviar a cuarentena</span></label><label className="receiving-form-full"><span>Incidencias / reclamo al proveedor</span><textarea disabled={detail.status==='closed'} rows={2} value={item.quality_notes||''} onChange={(event)=>updateDetailItem(item.id,{quality_notes:event.target.value})} placeholder="Daños, faltantes, sobrantes u observaciones"/></label></div></article>)}</div>
      <section className="receiving-evidence"><div><strong>Actas, fotografías y documentos</strong><small>Imágenes o PDF, máximo 1 MB por archivo.</small></div>{detail.status!=='closed'&&<label className="settings-secondary-button"><Upload size={15}/>Adjuntar evidencia<input hidden type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={uploadEvidence}/></label>}<div className="receiving-evidence-list">{detail.evidence?.map((file:any)=><a href={file.data_url||'#'} target="_blank" rel="noreferrer" key={file.id}>{file.file_name} · {file.mime_type}</a>)}</div></section>
    </div><footer><button type="button" className="settings-secondary-button" onClick={()=>setDetail(null)}>Cerrar ventana</button>{detail.status!=='closed'&&<><button type="button" className="settings-secondary-button" onClick={()=>void saveDetails()}>Guardar llegada</button>{canClose&&<button type="button" className="settings-primary-button" onClick={()=>void closeReceipt()}><ClipboardCheck size={15}/>Validar y cerrar</button>}</>}</footer></section></div>}

  {canCreate && <button type="button" className="receiving-transfer-fab" onClick={()=>{setOriginWarehouseId('');setTargetWarehouseId('');setNotes('');setTransferLines([{inventory_id:'',quantity:1}]);setShowTransferForm(true);}}><Truck size={17}/>Transferir entre bodegas</button>}
  </div>;
}
