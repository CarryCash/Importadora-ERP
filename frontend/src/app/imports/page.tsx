'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import {
   Ship,
   Package,
   MapPin,
   Calendar,
   CheckCircle2,
   Clock,
   AlertCircle,
   Search,
   Filter,
   Plus,
   X,
   Trash2
} from 'lucide-react';
import { motion } from 'framer-motion';

interface ImportShipment {
   id: string;
   supplier_name: string;
   import_date: string;
   country: string;
   status: 'PENDING' | 'IN_TRANSIT' | 'CUSTOMS' | 'WAREHOUSE' | 'CANCELED';
   bl_number: string;
   tracking_number: string;
   estimated_arrival: string;
   total_cost: number;
}

import { useAuth } from '../../components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function ImportsPage() {
   const { token, isLoading } = useAuth();
   const [shipments, setShipments] = useState<ImportShipment[]>([]);
   const [loading, setLoading] = useState(true);
   const [searchTerm, setSearchTerm] = useState('');
   const router = useRouter();

   useEffect(() => {
      if (!isLoading && !token) {
         router.push('/login');
      }
   }, [token, isLoading, router]);

   useEffect(() => {
      if (token) {
         fetchShipments();
      }
   }, [token]);

   const fetchShipments = async () => {
      try {
         const response = await fetch('/api/imports', {
            headers: { 'Authorization': `Bearer ${token}` }
         });
         if (response.ok) {
            const data = await response.json();
            setShipments(data);
         }
      } catch (error) {
         console.error('Error fetching shipments:', error);
      } finally {
         setLoading(false);
      }
   };

   const getStatusStyle = (status: string) => {
         switch (status) {
            case 'IN_TRANSIT': return { bg: '#ebf8ff', color: '#2b6cb0', icon: <Ship size={14} /> };
            case 'CUSTOMS': return { bg: '#fef3c7', color: '#92400e', icon: <AlertCircle size={14} /> };
            case 'WAREHOUSE': return { bg: '#f0fff4', color: '#276749', icon: <CheckCircle2 size={14} /> };
            case 'PENDING': return { bg: '#edf2f7', color: '#4a5568', icon: <Clock size={14} /> };
            default: return { bg: '#fff5f5', color: '#c53030', icon: <AlertCircle size={14} /> };
         }
      };

      const filteredShipments = Array.isArray(shipments)
         ? shipments.filter(s =>
         (s.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.bl_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase()))
         )
         : [];



      return (
         <div className="dashboard-layout">
            <Navbar />

            <main className="dashboard-content">
               <header className="page-header">
                  <div className="header-info">
                     <h1>Imports & Logistics</h1>
                     <p>Manage your international shipments, containers, and customs tracking.</p>
                  </div>
                  <a
                     href="/imports/new"
                     target="_blank"
                     className="add-import-btn"
                     rel="noopener noreferrer"
                  >
                     <Plus size={20} />
                     <span>New Shipment</span>
                  </a>
               </header>

               {/* Stats Section */}
               <section className="logistics-stats">
                  <div className="stat-card">
                     <div className="stat-icon transit"><Ship /></div>
                     <div className="stat-data">
                        <span className="s-label">In Transit</span>
                        <span className="s-value">{Array.isArray(shipments) ? shipments.filter(s => s.status === 'IN_TRANSIT').length : 0}</span>
                     </div>
                  </div>
                  <div className="stat-card">
                     <div className="stat-icon customs"><AlertCircle /></div>
                     <div className="stat-data">
                        <span className="s-label">In Customs</span>
                        <span className="s-value">{Array.isArray(shipments) ? shipments.filter(s => s.status === 'CUSTOMS').length : 0}</span>
                     </div>
                  </div>
                  <div className="stat-card">
                     <div className="stat-icon warehouse"><Package /></div>
                     <div className="stat-data">
                        <span className="s-label">Received</span>
                        <span className="s-value">{Array.isArray(shipments) ? shipments.filter(s => s.status === 'WAREHOUSE').length : 0}</span>
                     </div>
                  </div>
               </section>

               {/* Filters & Table */}
               <section className="shipments-container">
                  <div className="table-controls">
                     <div className="search-box">
                        <Search size={18} />
                        <input
                           type="text"
                           placeholder="Filter by BL, Container or Supplier..."
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                        />
                     </div>
                     <button className="filter-btn">
                        <Filter size={18} />
                        <span>Filters</span>
                     </button>
                  </div>

                  <div className="shipments-table-wrapper">
                     {loading ? (
                        <div className="loading-state">Loading logistics data...</div>
                     ) : (
                        <table className="shipments-table">
                           <thead>
                              <tr>
                                 <th>Vendor / Origin</th>
                                 <th>Bill of Lading / ID</th>
                                 <th>ETA</th>
                                 <th>Status</th>
                                 <th>Value</th>
                                 <th>Actions</th>
                              </tr>
                           </thead>
                           <tbody>
                              {filteredShipments.map((shipment) => {
                                 const style = getStatusStyle(shipment.status);
                                 return (
                                    <tr key={shipment.id}>
                                       <td>
                                          <div className="vendor-info">
                                             <span className="v-name">{shipment.supplier_name}</span>
                                             <span className="v-origin"><MapPin size={12} /> {shipment.country}</span>
                                          </div>
                                       </td>
                                       <td>
                                          <div className="tracking-info">
                                             <span className="bl">{shipment.bl_number || 'N/A'}</span>
                                             <span className="track">{shipment.tracking_number || shipment.id.substring(0, 8)}</span>
                                          </div>
                                       </td>
                                       <td>
                                          <div className="date-info">
                                             <Calendar size={14} />
                                             <span>{shipment.estimated_arrival ? new Date(shipment.estimated_arrival).toLocaleDateString() : 'TBD'}</span>
                                          </div>
                                       </td>
                                       <td>
                                          <div className="status-badge" style={{ backgroundColor: style.bg, color: style.color }}>
                                             {style.icon}
                                             <span>{shipment.status}</span>
                                          </div>
                                       </td>
                                       <td>
                                          <span className="shipment-value">${parseFloat(shipment.total_cost?.toString() || '0').toLocaleString()}</span>
                                       </td>
                                       <td>
                                          <a
                                             href={`/imports/${shipment.id}`}
                                             target="_blank"
                                             className="view-details"
                                             rel="noopener noreferrer"
                                          >
                                             Details
                                          </a>
                                       </td>
                                    </tr>
                                 )
                              })}
                           </tbody>
                        </table>
                     )}
                  </div>
               </section>
            </main>

            {/* No active modals */}

            <style jsx>{`
        /* Components Layout... */
        .dashboard-layout {
          min-height: 100vh;
          background-color: #f8f9fb;
        }

        .dashboard-content {
          max-width: 1540px;
          margin: 0 auto;
          padding: 32px 24px;
        }

        .page-header {
           display: flex;
           justify-content: space-between;
           align-items: center;
           margin-bottom: 32px;
        }

        .header-info h1 {
           font-size: 1.8rem;
           font-weight: 800;
           color: #1a202c;
           margin: 0 0 4px 0;
        }

        .header-info p {
           color: #718096;
           margin: 0;
           font-size: 0.95rem;
        }

        .add-import-btn {
           background-color: #064035;
           color: white;
           padding: 12px 24px;
           border-radius: 12px;
           display: flex;
           align-items: center;
           gap: 10px;
           font-weight: 600;
           box-shadow: 0 4px 12px rgba(6, 64, 53, 0.2);
           transition: all 0.2s;
        }

        .add-import-btn:hover {
           background-color: #0a5043;
           transform: translateY(-2px);
        }

        /* Stats Section */
        .logistics-stats {
           display: grid;
           grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
           gap: 24px;
           margin-bottom: 32px;
        }

        .stat-card {
           background: var(--card);
           padding: 24px;
           border-radius: 16px;
           display: flex;
           align-items: center;
           gap: 20px;
           box-shadow: 0 2px 4px rgba(0,0,0,0.02);
           border: 1px solid #edf2f7;
        }

        .stat-icon {
           width: 48px;
           height: 48px;
           border-radius: 12px;
           display: flex;
           align-items: center;
           justify-content: center;
        }

        .stat-icon.transit { background: #ebf8ff; color: #2b6cb0; }
        .stat-icon.customs { background: #fef3c7; color: #92400e; }
        .stat-icon.warehouse { background: #f0fff4; color: #276749; }

        .s-label {
           display: block;
           font-size: 0.85rem;
           color: #718096;
           font-weight: 600;
        }

        .s-value {
           font-size: 1.5rem;
           font-weight: 800;
           color: #1a202c;
        }

        /* SHIPMENTS TABLE */
        .shipments-container {
           background: var(--card);
           border-radius: 20px;
           border: 1px solid #edf2f7;
           overflow: hidden;
           box-shadow: 0 4px 10px rgba(0,0,0,0.01);
        }

        .table-controls {
           padding: 24px;
           border-bottom: 1px solid #edf2f7;
           display: flex;
           justify-content: space-between;
           gap: 20px;
        }

        .search-box {
           flex: 1;
           max-width: 400px;
           background: #f7fafc;
           border: 1px solid var(--border);
           border-radius: 10px;
           display: flex;
           align-items: center;
           padding: 0 14px;
           gap: 12px;
           color: #a0aec0;
        }

        .search-box input {
           flex: 1;
           background: transparent;
           border: none;
           padding: 10px 0;
           outline: none;
           font-size: 0.9rem;
           color: #2d3748;
        }

        .filter-btn {
           background: var(--card);
           border: 1px solid var(--border);
           padding: 0 16px;
           border-radius: 10px;
           display: flex;
           align-items: center;
           gap: 8px;
           font-weight: 600;
           color: #4a5568;
        }

        .shipments-table-wrapper {
           overflow-x: auto;
        }

        .shipments-table {
           width: 100%;
           border-collapse: collapse;
           text-align: left;
        }

        .shipments-table th {
           padding: 16px 24px;
           font-size: 0.75rem;
           font-weight: 700;
           text-transform: uppercase;
           letter-spacing: 0.05em;
           color: #718096;
           background: #fbfcfd;
        }

        .shipments-table td {
           padding: 20px 24px;
           border-bottom: 1px solid #edf2f7;
           vertical-align: middle;
        }

        .vendor-info, .tracking-info, .date-info {
           display: flex;
           flex-direction: column;
           gap: 4px;
        }

        .v-name {
           font-weight: 700;
           color: #1a202c;
           font-size: 0.95rem;
        }

        .v-origin {
           font-size: 0.8rem;
           color: #718096;
           display: flex;
           align-items: center;
           gap: 4px;
        }

        .bl {
           font-family: 'Courier New', monospace;
           font-weight: 800;
           color: #2d3748;
           font-size: 0.9rem;
        }

        .track {
           font-size: 0.75rem;
           color: #a0aec0;
        }

        .date-info {
           flex-direction: row;
           align-items: center;
           gap: 8px;
           font-size: 0.9rem;
           color: #4a5568;
        }

        .status-badge {
           display: inline-flex;
           align-items: center;
           gap: 6px;
           padding: 4px 10px;
           border-radius: 6px;
           font-size: 0.75rem;
           font-weight: 700;
           text-transform: uppercase;
        }

        .shipment-value {
           font-weight: 700;
           color: #1a202c;
        }

        .view-details {
           color: #3182ce;
           font-weight: 700;
           font-size: 0.85rem;
           background: transparent;
        }

        .view-details:hover {
           text-decoration: underline;
        }

        .loading-state {
           padding: 80px;
           text-align: center;
           color: #a0aec0;
           font-weight: 500;
        }
      `}</style>
    </div>
  );
}
