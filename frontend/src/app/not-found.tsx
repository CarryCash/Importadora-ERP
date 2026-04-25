'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { SearchX, Sparkles, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="not-found-layout">
      <Navbar />
      
      <main className="not-found-content">
        <div className="error-container">
          <div className="icon-wrapper">
            <SearchX size={54} strokeWidth={1.5} className="error-icon" />
            <div className="sparkle-1"><Sparkles size={20} strokeWidth={1.5} /></div>
            <div className="sparkle-2"><Sparkles size={16} strokeWidth={1.5} /></div>
          </div>
          
          <h1 className="error-code">404</h1>
          <h2 className="error-title">Lote Extraviado</h2>
          
          <p className="error-message">
            Lo sentimos, la página que buscas parece haberse perdido en la aduana o el cosmético ya no forma parte de nuestro catálogo de importación.
          </p>
          
          <div className="action-buttons">
            <Link href="/dashboard" className="btn-primary">
              <ArrowLeft size={18} />  Volver al Panel de Control
            </Link>
          </div>
        </div>
      </main>

      <style jsx>{`
        .not-found-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--background);
        }
        
        .not-found-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .error-container {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 60px 40px;
          max-width: 500px;
          width: 100%;
          text-align: center;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
          position: relative;
          overflow: hidden;
        }

        /* Línea superior con estética de marca */
        .error-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: linear-gradient(90deg, #10b981, #059669, #047857);
        }

        .icon-wrapper {
          position: relative;
          width: 100px;
          height: 100px;
          background: var(--secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          color: #059669;
        }

        .sparkle-1 {
          position: absolute;
          top: -10px;
          right: -10px;
          color: #fbbf24;
          animation: float 3s ease-in-out infinite;
        }

        .sparkle-2 {
          position: absolute;
          bottom: 10px;
          left: -15px;
          color: #f59e0b;
          animation: float 2.5s ease-in-out infinite alternate;
        }

        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }

        .error-code {
          font-size: 6rem;
          font-weight: 900;
          line-height: 1;
          margin: 0 0 12px;
          color: var(--foreground);
          letter-spacing: -3px;
        }

        .error-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--foreground);
          margin-bottom: 16px;
        }

        .error-message {
          color: var(--muted-foreground);
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 32px;
        }

        .action-buttons {
          display: flex;
          justify-content: center;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #064035;
          color: white;
          padding: 14px 28px;
          border-radius: 12px;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 6px -1px rgba(6, 64, 53, 0.2);
        }

        .btn-primary:hover {
          background: #042f27;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px -2px rgba(6, 64, 53, 0.3);
        }

        @media (max-width: 640px) {
          .error-container {
            padding: 40px 24px;
          }
          .error-code {
            font-size: 4.5rem;
          }
        }
      `}</style>
    </div>
  );
}
