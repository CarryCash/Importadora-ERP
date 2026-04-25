'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Navbar from '../../../components/Navbar';
import { 
  Ship, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ArrowLeft,
  Package,
  Globe,
  Truck,
  DollarSign,
  ShieldCheck,
  Anchor
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function ImportDetailPage() {
  const { id } = useParams();
  const { token, isLoading } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) {
      router.push('/login');
    }
  }, [token, isLoading, router]);

  useEffect(() => {
    if (token && id) {
      fetchImportDetail();
    }
  }, [token, id]);

  const fetchImportDetail = async () => {
    try {
      const response = await fetch(`http://localhost:3000/api/imports/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setDetails(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/imports/${id}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) fetchImportDetail();
    } catch (err) { console.error(err); }
  };

  const handleReceive = async () => {
    const actual_arrival = new Date().toISOString().split('T')[0];
    try {
      const response = await fetch(`http://localhost:3000/api/imports/${id}/receive`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ actual_arrival })
      });
      if (response.ok) fetchImportDetail();
    } catch (err) { console.error(err); }
  };

  if (loading || isLoading) {
    return (
      <div className="loading-screen">
        <Navbar />
        <div className="loader-container">
           <div className="spinner"></div>
           <p>Cargando detalles del embarque...</p>
        </div>
        <style jsx>{`
          .loading-screen { min-height: 100vh; background: #f8f9fb; }
          .loader-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 70vh; color: #718096; }
          .spinner { width: 40px; height: 40px; border: 4px solid #edf2f7; border-top: 4px solid #064035; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="error-page">
        <Navbar />
        <div className="error-container">
           <AlertCircle size={48} color="#f56565" />
           <h1>Embarque no encontrado</h1>
           <p>No pudimos encontrar la importación con ID: {id}</p>
           <button onClick={() => router.push('/imports')} className="back-btn">Volver</button>
        </div>
      </div>
    );
  }

  const totalUnits = details.items?.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0) || 0;

  return (
    <div className="detail-page-wrapper">
      <Navbar />
      
      <main className="detail-content">
        <div className="content-container">
          <div className="detail-header">
            <button onClick={() => router.push('/imports')} className="back-link">
              <ArrowLeft size={18} />
              <span>Volver a Importaciones</span>
            </button>
            <div className="title-row">
               <div className="main-title">
                  <h1>Importación: {details.bl_number || 'S/N'}</h1>
                  <span className="track-id">Tracking: {details.tracking_number || details.id}</span>
               </div>
               <div className="status-indicator" style={getStatusStyle(details.status)}>
                  {getStatusIcon(details.status)}
                  <span>{details.status}</span>
               </div>
            </div>
          </div>

          <div className="detail-grid">
            <div className="main-column">
               {/* Logistics Info Card */}
               <section className="card info-grid-card">
                  <h2 className="section-title"><Truck size={20}/> Información Logística</h2>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Proveedor</span>
                      <span className="info-value">{details.supplier_name}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">País Origen</span>
                      <span className="info-value">{details.country}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Incoterm</span>
                      <span className="info-value-badge">{details.incoterm || 'N/A'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Naviera / Courier</span>
                      <span className="info-value">{details.courier || 'No especificado'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Fecha Embarque</span>
                      <span className="info-value">{new Date(details.import_date).toLocaleDateString()}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Llegada Estimada (ETA)</span>
                      <span className="info-value">{details.estimated_arrival ? new Date(details.estimated_arrival).toLocaleDateString() : 'TBD'}</span>
                    </div>
                  </div>
               </section>

               {/* Products Table */}
               <section className="card products-section">
                  <h2 className="section-title"><Package size={20}/> Productos e Inventario (Detalle)</h2>
                  <div className="table-wrapper">
                    <table className="items-table">
                      <thead>
                         <tr>
                            <th>Producto / SKU</th>
                            <th>Lote</th>
                            <th>Cantidad</th>
                            <th>Costo Unit.</th>
                            <th>Sugerido (40%)</th>
                            <th>Vencimiento</th>
                            <th>Ubicación</th>
                         </tr>
                      </thead>
                      <tbody>
                         {details.items?.map((item: any) => (
                            <tr key={item.id} className="item-row">
                               <td>
                                  <div className="p-info">
                                     <span className="p-name">{item.product_name}</span>
                                     <span className="p-sku">{item.sku}</span>
                                  </div>
                               </td>
                               <td><code className="batch-code">{item.batch_number}</code></td>
                               <td><span className="qty-badge">{item.quantity} unds.</span></td>
                               <td><span className="price-tag">${parseFloat(item.unit_landed_cost || 0).toFixed(2)}</span></td>
                               <td><span className="price-tag suggested">${parseFloat(item.suggested_sale_price || 0).toFixed(2)}</span></td>
                               <td><span className="date-text">{item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : 'N/A'}</span></td>
                               <td><span className="loc-text">{item.warehouse_location}</span></td>
                            </tr>
                         ))}
                      </tbody>
                    </table>
                  </div>
               </section>
            </div>

            <div className="side-column">
               {details.status !== 'WAREHOUSE' && (
                 <section className="card action-card">
                    <h2 className="section-title"><CheckCircle2 size={20}/> Gestión de Estado</h2>
                    <button onClick={handleReceive} className="receive-btn">
                       Marcar como Arribado
                    </button>
                    <div className="status-quick-change">
                       <span>Cambiar a:</span>
                       <button onClick={() => handleStatusUpdate('CUSTOMS')}>Aduana</button>
                       <button onClick={() => handleStatusUpdate('IN_TRANSIT')}>Tránsito</button>
                    </div>
                 </section>
               )}

               <section className="card financial-card">
                  <h2 className="section-title"><DollarSign size={20}/> Liquidación Financiera</h2>
                  
                  <div className="cost-breakdown">
                     <div className="c-item"><span>Valor FOB</span> <span>${parseFloat(details.fob_value || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                     <div className="c-item"><span>Flete</span> <span>${parseFloat(details.freight_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                     <div className="c-item"><span>Seguro</span> <span>${parseFloat(details.insurance_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                     
                     <div className="divider"></div>
                     <div className="c-item-tax"><span>Arancel / Ad-Valorem</span> <span>${parseFloat(details.customs_taxes || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                     <div className="c-item-tax"><span>FODINFA (0.5%)</span> <span>${parseFloat(details.fodinfa_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                     <div className="c-item-tax"><span>IVA Importación</span> <span>${parseFloat(details.iva_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                     <div className="c-item-tax"><span>Tasas ARCSA/Otros</span> <span>${parseFloat(details.arcsa_taxes || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                  </div>

                  <div className="unit-cost-summary">
                     <span className="u-label">Costo Unitario Promedio</span>
                     <span className="u-val">
                        ${totalUnits > 0 ? (details.total_cost / totalUnits).toFixed(2) : '0.00'} 
                        <small> / unidad</small>
                     </span>
                  </div>

                  <div className="cost-total">
                     <span>Inversión Total</span>
                     <span>${parseFloat(details.total_cost).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
               </section>

               <div className="info-tip">
                  <ShieldCheck size={20} />
                  <p>Este costo unitario incluye todos los gastos nacionalizados y es el que se utilizará para el cálculo de márgenes de venta.</p>
               </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx>{`
        .detail-page-wrapper { min-height: 100vh; background-color: #f8f9fb; }
        .detail-content { padding: 40px 0; }
        .content-container { max-width: 1400px; margin: 0 auto; padding: 0 40px; }
        .detail-header { margin-bottom: 32px; }
        .back-link { display: flex; align-items: center; gap: 8px; color: #718096; font-weight: 600; font-size: 0.9rem; margin-bottom: 16px; background: transparent; border: none; cursor: pointer; }
        .title-row { display: flex; justify-content: space-between; align-items: center; }
        .main-title h1 { font-size: 1.8rem; font-weight: 800; color: #1a202c; margin: 0; }
        .track-id { color: #94a3b8; font-size: 0.85rem; }
        .status-indicator { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; }

        .detail-grid { display: grid; grid-template-columns: 1fr 380px; gap: 24px; }
        .card { background: var(--card); padding: 32px; border-radius: 20px; border: 1px solid #edf2f7; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .section-title { font-size: 1rem; font-weight: 700; color: #2d3748; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .info-item { display: flex; flex-direction: column; gap: 4px; }
        .info-label { font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
        .info-value { font-size: 1rem; font-weight: 700; color: #2d3748; }
        .info-value-badge { font-size: 0.85rem; font-weight: 800; color: #3182ce; background: #ebf8ff; padding: 4px 10px; border-radius: 6px; width: fit-content; }

        .items-table { width: 100%; border-collapse: collapse; }
        .items-table th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; padding: 12px 8px; border-bottom: 1px solid #edf2f7; }
        .item-row td { padding: 16px 8px; border-bottom: 1px solid #f7fafc; }
        .p-info { display: flex; flex-direction: column; }
        .p-name { font-weight: 700; color: #1a202c; font-size: 0.9rem; }
        .p-sku { font-size: 0.75rem; color: #718096; }
        .batch-code { font-family: monospace; font-weight: 600; color: #4a5568; background: #f7fafc; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
        .qty-badge { font-weight: 700; color: #064035; }
        .price-tag { font-weight: 700; color: #2d3748; }
        .suggested { color: #10b981; }

        .action-card { background: #f0fff4; border: 1px solid #c6f6d5; }
        .receive-btn { width: 100%; padding: 16px; border-radius: 12px; background: #064035; color: white; font-weight: 800; font-size: 1rem; margin-bottom: 16px; cursor: pointer; border: none; }
        .status-quick-change { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #718096; }
        .status-quick-change button { background: var(--card); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; cursor: pointer; }

        .cost-breakdown { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .c-item, .c-item-tax { display: flex; justify-content: space-between; font-size: 0.85rem; color: #718096; }
        .c-item span:last-child { font-weight: 700; color: #2d3748; }
        .c-item-tax span:last-child { font-weight: 600; color: #c53030; }
        .divider { height: 1px; background: #edf2f7; margin: 8px 0; }

        .unit-cost-summary { background: var(--background); padding: 16px; border-radius: 12px; border: 1px dashed var(--border); margin-bottom: 20px; }
        .u-label { font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .u-val { font-size: 1.5rem; font-weight: 800; color: #064035; }
        .u-val small { font-size: 0.8rem; opacity: 0.6; }

        .cost-total { display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid #edf2f7; font-weight: 800; font-size: 1.3rem; color: #1a202c; }

        .info-tip { display: flex; gap: 12px; padding: 20px; background: #ebf8ff; border-radius: 16px; color: #2b6cb0; font-size: 0.85rem; }

        @media (max-width: 1100px) { .detail-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'IN_TRANSIT': return { backgroundColor: '#ebf8ff', color: '#2b6cb0' };
    case 'CUSTOMS': return { backgroundColor: '#fef3c7', color: '#92400e' };
    case 'WAREHOUSE': return { backgroundColor: '#f0fff4', color: '#276749' };
    case 'PENDING': return { backgroundColor: '#edf2f7', color: '#4a5568' };
    default: return { backgroundColor: '#fff5f5', color: '#c53030' };
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'IN_TRANSIT': return <Ship size={18} />;
    case 'CUSTOMS': return <AlertCircle size={18} />;
    case 'WAREHOUSE': return <CheckCircle2 size={18} />;
    default: return <Clock size={18} />;
  }
}
