'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Navbar from '../../../components/Navbar';
import { 
  ArrowLeft,
  Ship,
  Package,
  Plus,
  Trash2,
  DollarSign,
  Globe,
  Truck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Anchor
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function NewShipmentPage() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    supplier_id: '',
    import_date: new Date().toISOString().split('T')[0],
    country: '',
    shipping_cost: 0,
    tax_cost: 0,
    total_cost: 0,
    fob_value: 0,
    freight_cost: 0,
    insurance_cost: 0,
    customs_taxes: 0,
    arcsa_taxes: 0,
    exchange_rate: 1,
    bl_number: '',
    tracking_number: '',
    estimated_arrival: '',
    status: 'IN_TRANSIT',
    incoterm: 'FOB',
    courier: '',
    fodinfa_cost: 0,
    iva_cost: 0
  });

  const [items, setItems] = useState<any[]>([
    { product_id: '', batch_number: '', quantity: 0, manufacturing_date: '', expiration_date: '', warehouse_location: 'Central' }
  ]);

  // Auto-calculate total cost and update tax sum
  useEffect(() => {
    const totalTaxes = Number(formData.customs_taxes) + Number(formData.arcsa_taxes) + Number(formData.fodinfa_cost) + Number(formData.iva_cost);
    const total = Number(formData.fob_value) + 
                  Number(formData.freight_cost) + 
                  Number(formData.insurance_cost) + 
                  totalTaxes;
    
    setFormData(prev => ({ ...prev, total_cost: total, tax_cost: totalTaxes }));
  }, [formData.fob_value, formData.freight_cost, formData.insurance_cost, formData.customs_taxes, formData.arcsa_taxes, formData.fodinfa_cost, formData.iva_cost]);

  const totalUnits = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const avgUnitCost = totalUnits > 0 ? (formData.total_cost / totalUnits).toFixed(2) : '0.00';

  useEffect(() => {
    if (!isLoading && !token) {
      router.push('/login');
    }
  }, [token, isLoading, router]);

  useEffect(() => {
    if (token) {
      fetchSuppliers();
      fetchProducts();
    }
  }, [token]);

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/suppliers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSuppliers(data);
    } catch (err) { console.error(err); }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setProducts(data);
    } catch (err) { console.error(err); }
  };

  const addItem = () => {
    setItems([...items, { product_id: '', batch_number: '', quantity: 0, manufacturing_date: '', expiration_date: '', warehouse_location: 'Central' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate items before sending
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id) { showToast(`❌ Línea ${i + 1}: Debes seleccionar un producto`, 'error'); return; }
      if (!item.batch_number) { showToast(`❌ Línea ${i + 1}: El número de lote es requerido`, 'error'); return; }
      if (!item.quantity || Number(item.quantity) <= 0) { showToast(`❌ Línea ${i + 1}: La cantidad debe ser mayor a 0`, 'error'); return; }
      if (!item.expiration_date) { showToast(`❌ Línea ${i + 1}: La fecha de expiración es requerida (norma ARCSA)`, 'error'); return; }
    }

    setIsSaving(true);
    const payload = { ...formData, items };
    try {
      const response = await fetch('http://localhost:3000/api/imports', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast('✅ ¡Embarque registrado exitosamente!', 'success');
        setTimeout(() => router.push('/imports'), 1500);
      } else {
        const errorData = await response.json().catch(() => ({}));
        showToast(`❌ Error: ${errorData.message || 'No se pudo guardar el embarque'}`, 'error');
        setIsSaving(false);
      }
    } catch (err) { 
      showToast('❌ Error de red: No se pudo conectar con el servidor', 'error');
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="loading">Loading...</div>;

  return (
    <div className="new-shipment-wrapper">
      <Navbar />

      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
      
      <main className="wizard-container">
        <div className="wizard-content">
          <div className="wizard-header">
            <button onClick={() => router.push('/imports')} className="back-link">
              <ArrowLeft size={18} />
              <span>Volver a Importaciones</span>
            </button>
            <h1>Nueva Entrada de Importación</h1>
            <p>Registre los detalles logísticos y financieros del nuevo embarque.</p>
          </div>

          <form onSubmit={handleSubmit} id="shipment-wizard-form">
            <div className="grid-layout">
              <div className="main-side">
                 {/* Logistics Section */}
                 <section className="card">
                    <h2 className="section-title"><Truck size={20}/> 1. Logística y Seguimiento</h2>
                    <div className="form-grid">
                       <div className="form-group">
                          <label>Proveedor</label>
                          <select value={formData.supplier_id} onChange={e => setFormData({...formData, supplier_id: e.target.value})} required>
                             <option value="">Seleccione un proveedor...</option>
                             {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                       </div>
                       <div className="form-group">
                          <label>Incoterm</label>
                          <select value={formData.incoterm} onChange={e => setFormData({...formData, incoterm: e.target.value})} required>
                             <option value="FOB">FOB - Free On Board</option>
                             <option value="CIF">CIF - Cost, Insurance and Freight</option>
                             <option value="EXW">EXW - Ex Works</option>
                             <option value="DDP">DDP - Delivered Duty Paid</option>
                             <option value="CFR">CFR - Cost and Freight</option>
                          </select>
                       </div>
                       <div className="form-group">
                          <label>Naviera / Courier</label>
                          <input type="text" value={formData.courier} onChange={e => setFormData({...formData, courier: e.target.value})} placeholder="Ej: Maersk, DHL, FedEx..." required />
                       </div>
                       <div className="form-group">
                          <label>País de Origen</label>
                          <input type="text" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} placeholder="Ej: China, USA, España" required />
                       </div>
                       <div className="form-group">
                          <label>BL / Master AWB</label>
                          <input type="text" value={formData.bl_number} onChange={e => setFormData({...formData, bl_number: e.target.value})} placeholder="Número de BL o Guía Aérea" required />
                       </div>
                       <div className="form-group">
                          <label>Número de Contenedor / Tracking</label>
                          <input type="text" value={formData.tracking_number} onChange={e => setFormData({...formData, tracking_number: e.target.value})} placeholder="ID de seguimiento" />
                       </div>
                       <div className="form-group">
                          <label>Fecha de Embarque</label>
                          <input type="date" value={formData.import_date} onChange={e => setFormData({...formData, import_date: e.target.value})} required />
                       </div>
                       <div className="form-group">
                          <label>ETA (Llegada Estimada)</label>
                          <input type="date" value={formData.estimated_arrival} onChange={e => setFormData({...formData, estimated_arrival: e.target.value})} required />
                       </div>
                    </div>
                 </section>

                 {/* Items Table Section */}
                 <section className="card">
                    <h2 className="section-title"><Package size={20}/> 2. Productos y Lotes (ARCSA)</h2>
                    <div className="items-table-container">
                       <table className="wizard-table">
                          <thead>
                             <tr>
                                <th>Producto / SKU</th>
                                <th>N° de Lote</th>
                                <th>Cantidad</th>
                                <th>Vencimiento</th>
                                <th>Ubicación</th>
                                <th></th>
                             </tr>
                          </thead>
                          <tbody>
                             {items.map((item, index) => (
                                <tr key={index} className="wizard-row">
                                   <td>
                                      <select value={item.product_id} onChange={e => handleItemChange(index, 'product_id', e.target.value)} required>
                                         <option value="">Producto...</option>
                                         {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                      </select>
                                   </td>
                                   <td><input type="text" value={item.batch_number} onChange={e => handleItemChange(index, 'batch_number', e.target.value)} placeholder="LOTE-001" required /></td>
                                   <td><input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))} required style={{ width: '80px'}} /></td>
                                   <td><input type="date" value={item.expiration_date} onChange={e => handleItemChange(index, 'expiration_date', e.target.value)} required /></td>
                                   <td><input type="text" value={item.warehouse_location} onChange={e => handleItemChange(index, 'warehouse_location', e.target.value)} placeholder="Percha" /></td>
                                   <td>
                                      {items.length > 1 && (
                                        <button type="button" onClick={() => removeItem(index)} className="remove-item"><Trash2 size={18} /></button>
                                      )}
                                   </td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                       <button type="button" onClick={addItem} className="add-item-btn">
                          <Plus size={18} />
                          <span>Agregar Línea de Producto</span>
                       </button>
                    </div>
                 </section>
              </div>

              {/* Right Side: Financials & Action */}
              <div className="side-side">
                 <section className="card financial-card">
                    <h2 className="section-title"><DollarSign size={20}/> 3. Liquidación de Costos</h2>
                    
                    <div className="financial-group">
                      <div className="f-title">Valores en Factura</div>
                      <div className="form-group space-bottom">
                         <label>Valor FOB (Total Factura $)</label>
                         <input type="number" step="0.01" value={formData.fob_value} onChange={e => setFormData({...formData, fob_value: Number(e.target.value)})} />
                      </div>
                      <div className="form-group space-bottom">
                         <label>Flete Internacional ($)</label>
                         <input type="number" step="0.01" value={formData.freight_cost} onChange={e => setFormData({...formData, freight_cost: Number(e.target.value)})} />
                      </div>
                      <div className="form-group space-bottom">
                         <label>Seguro ($)</label>
                         <input type="number" step="0.01" value={formData.insurance_cost} onChange={e => setFormData({...formData, insurance_cost: Number(e.target.value)})} />
                      </div>
                    </div>

                    <div className="financial-group border-top">
                      <div className="f-title">Impuestos y Tasas (Ecuador)</div>
                      <div className="form-group space-bottom">
                         <label>Arancel / Ad-Valorem ($)</label>
                         <input type="number" step="0.01" value={formData.customs_taxes} onChange={e => setFormData({...formData, customs_taxes: Number(e.target.value)})} />
                      </div>
                      <div className="form-group space-bottom">
                         <label>FODINFA (0.5% CIF) ($)</label>
                         <input type="number" step="0.01" value={formData.fodinfa_cost} onChange={e => setFormData({...formData, fodinfa_cost: Number(e.target.value)})} />
                      </div>
                      <div className="form-group space-bottom">
                         <label>IVA Importación ($)</label>
                         <input type="number" step="0.01" value={formData.iva_cost} onChange={e => setFormData({...formData, iva_cost: Number(e.target.value)})} />
                      </div>
                      <div className="form-group space-bottom">
                         <label>Tasas ARCSA / Otros ($)</label>
                         <input type="number" step="0.01" value={formData.arcsa_taxes} onChange={e => setFormData({...formData, arcsa_taxes: Number(e.target.value)})} />
                      </div>
                    </div>

                    <div className="unit-cost-badge">
                       <div className="u-label">Costo Unitario (Landed Cost)</div>
                       <div className="u-value">${avgUnitCost} <span className="currency">USD</span></div>
                    </div>
                    
                    <div className="total-indicator">
                       <span>Inversión Total Proyectada</span>
                       <span className="total-val">${(formData.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="action-zone">
                       <button type="submit" className="save-btn" disabled={isSaving}>
                          {isSaving ? 'Procesando...' : 'Registrar Importación'}
                       </button>
                       <button type="button" onClick={() => router.push('/imports')} className="cancel-btn">
                          Cancelar
                       </button>
                    </div>
                 </section>

                 <div className="info-tip">
                    <AlertCircle size={20} />
                    <p>El costo unitario se calcula dividiendo la inversión total entre el número de unidades ingresadas. Esto actualizará el costo promedio en el inventario.</p>
                 </div>
              </div>
            </div>
          </form>
        </div>
      </main>

      <style jsx>{`
        .toast-notification {
          position: fixed;
          top: 80px;
          right: 24px;
          z-index: 9999;
          padding: 16px 24px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 0.95rem;
          box-shadow: 0 8px 30px rgba(0,0,0,0.15);
          animation: slideInRight 0.3s ease;
          max-width: 400px;
        }

        .toast-success { background: #064035; color: white; border-left: 4px solid #68d391; }
        .toast-error { background: #c53030; color: white; border-left: 4px solid #fc8181; }

        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .new-shipment-wrapper { min-height: 100vh; background-color: #f8f9fb; }
        .wizard-container { padding: 40px 0; }
        .wizard-content { max-width: 1400px; margin: 0 auto; padding: 0 40px; }
        .wizard-header { margin-bottom: 32px; }
        .back-link { display: flex; align-items: center; gap: 8px; color: #718096; font-weight: 600; font-size: 0.9rem; margin-bottom: 16px; background: transparent; border: none; cursor: pointer; }
        .wizard-header h1 { font-size: 2rem; font-weight: 800; color: #1a202c; margin: 0 0 8px 0; }
        .wizard-header p { color: #718096; margin: 0; }

        .grid-layout { display: grid; grid-template-columns: 1fr 420px; gap: 24px; align-items: start; }
        .card { background: var(--card); padding: 32px; border-radius: 20px; border: 1px solid #edf2f7; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .section-title { font-size: 1.1rem; font-weight: 700; color: #2d3748; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }

        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 0.75rem; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.025em; }
        .form-group input, .form-group select { height: 44px; border: 1px solid var(--border); border-radius: 10px; padding: 0 12px; font-size: 0.95rem; background: var(--background); outline: none; }
        .form-group input:focus { border-color: #3182ce; background: var(--card); }

        .financial-group { margin-bottom: 24px; }
        .f-title { font-size: 0.85rem; font-weight: 700; color: #1a202c; margin-bottom: 16px; background: #f7fafc; padding: 8px 12px; border-radius: 8px; }
        .border-top { border-top: 1px solid #edf2f7; padding-top: 24px; }

        .items-table-container { margin-top: 8px; overflow-x: auto; }
        .wizard-table { width: 100%; border-collapse: collapse; min-width: 800px; }
        .wizard-table th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; padding: 12px 8px; border-bottom: 1px solid #edf2f7; }
        .wizard-row td { padding: 12px 8px; border-bottom: 1px solid #f7fafc; }
        .wizard-row input, .wizard-row select { width: 100%; height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; font-size: 0.9rem; }

        .add-item-btn { margin-top: 16px; background: var(--background); border: 2px dashed var(--border); width: 100%; padding: 14px; border-radius: 12px; color: #718096; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; }
        .remove-item { color: #f56565; background: transparent; border: none; cursor: pointer; }

        .unit-cost-badge { background: #ebf8ff; border: 1px solid #bee3f8; padding: 20px; border-radius: 16px; margin-bottom: 24px; text-align: center; }
        .u-label { font-size: 0.75rem; font-weight: 700; color: #2b6cb0; text-transform: uppercase; margin-bottom: 4px; }
        .u-value { font-size: 1.75rem; font-weight: 800; color: #2c5282; }

        .total-indicator { background: #f0fff4; padding: 20px; border-radius: 16px; display: flex; flex-direction: column; gap: 4px; border: 1px solid #c6f6d5; margin-bottom: 24px; }
        .total-val { font-size: 2rem; font-weight: 800; color: #22543d; }

        .action-zone { display: flex; flex-direction: column; gap: 12px; }
        .save-btn { width: 100%; padding: 16px; border-radius: 12px; background: #064035; color: white; font-weight: 700; font-size: 1rem; cursor: pointer; border: none; }
        .cancel-btn { width: 100%; padding: 16px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); color: #718096; font-weight: 600; cursor: pointer; }

        .info-tip { display: flex; gap: 12px; padding: 20px; background: #fffaf0; border-radius: 16px; border: 1px solid #feebc8; color: #9c4221; font-size: 0.85rem; }

        @media (max-width: 1200px) { .grid-layout { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
