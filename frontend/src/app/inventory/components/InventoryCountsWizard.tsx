'use client';

import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Package,
  Layers,
  FileText,
} from 'lucide-react';

interface InventoryCountsWizardProps {
  onCountReconciled?: () => void;
}

const API = '/api';

export default function InventoryCountsWizard({ onCountReconciled }: InventoryCountsWizardProps) {
  const [counts, setCounts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

  const [currentCount, setCurrentCount] = useState<any>(null);
  const [countLines, setCountLines] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [createForm, setCreateForm] = useState({
    warehouse_id: '',
    count_type: 'full' as 'full' | 'cyclic',
    notes: '',
    freeze_locations: true,
  });

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const [cntRes, whRes] = await Promise.all([
        fetch(`${API}/inventory/counts`),
        fetch(`${API}/inventory/warehouses`),
      ]);
      if (cntRes.ok) setCounts(await cntRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  // Paso 1: Iniciar conteo con congelamiento
  const handleStartCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.warehouse_id) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/inventory/counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al iniciar conteo');
      }
      const newCount = await res.json();
      setCurrentCount(newCount);
      setCountLines(newCount.lines || []);
      setActiveStep(2);
      setNotice(`Conteo ${newCount.count_number} iniciado con congelamiento transaccional activo.`);
      fetchCounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Abrir conteo existente
  const handleOpenExistingCount = async (countId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/inventory/counts/${countId}`);
      if (res.ok) {
        const countData = await res.json();
        setCurrentCount(countData);
        setCountLines(countData.lines || []);
        setShowWizard(true);
        if (countData.status === 'reconciled') {
          setActiveStep(4);
        } else if (countData.lines?.some((l: any) => l.counted_quantity !== null)) {
          setActiveStep(3);
        } else {
          setActiveStep(2);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // Paso 2: Guardar conteo físico
  const handleSavePhysicalLines = async () => {
    if (!currentCount) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        lines: countLines.map((l) => ({
          id: l.id,
          counted_quantity: Number(l.counted_quantity ?? l.expected_quantity),
          reason: l.reason || '',
        })),
      };
      const res = await fetch(`${API}/inventory/counts/${currentCount.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al guardar conteos');
      }
      const updated = await res.json();
      setCurrentCount(updated);
      setCountLines(updated.lines || []);
      setActiveStep(3);
      setNotice('Cantidades físicas registradas. Revisa la conciliación de diferencias.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Paso 3 -> 4: Conciliar y regularizar automáticamente con FIFO
  const handleReconcileAndAdjust = async () => {
    if (!currentCount) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/inventory/counts/${currentCount.id}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Ajuste compensatorio automático por conciliación física' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al conciliar conteo');
      }
      const finalized = await res.json();
      setCurrentCount(finalized);
      setActiveStep(4);
      setNotice(`Conteo ${finalized.count_number} conciliado y ajustado exitosamente. Congelamiento liberado.`);
      fetchCounts();
      if (onCountReconciled) onCountReconciled();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredCounts = counts.filter(
    (c) =>
      c.count_number?.toLowerCase().includes(query.toLowerCase()) ||
      c.warehouse_name?.toLowerCase().includes(query.toLowerCase()),
  );

  const totalVariances = countLines.filter((l) => Number(l.variance || 0) !== 0).length;
  const netValuationImpact = countLines.reduce(
    (acc, l) => acc + Number(l.variance || 0) * Number(l.unit_cost_fifo || 0),
    0,
  );

  return (
    <div className="inventory-counts-section">
      {/* Banner / Header */}
      <div className="section-header">
        <div>
          <h2>Auditoría Física y Congelamiento</h2>
          <p className="subtitle">
            Toma de inventario estructurada por pasos: congelamiento de movimientos, registro ciego o asistido, cálculo de discrepancias y regularización automática con capas de costo FIFO.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn-primary"
            onClick={() => {
              setCurrentCount(null);
              setCountLines([]);
              setActiveStep(1);
              setShowWizard(true);
            }}
          >
            <Plus size={18} /> Iniciar Conteo Físico
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="toast err" style={{ position: 'static', marginBottom: 16 }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="toast ok" style={{ position: 'static', marginBottom: 16 }}>
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      {/* Métricas KPI (stats-grid estándar ERP) */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
            <ClipboardCheck size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Auditorías Totales</span>
            <span className="stat-value">{counts.length}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
            <Lock size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">En Conteo / Congeladas</span>
            <span className="stat-value">{counts.filter((c) => c.status === 'counting').length}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Conciliadas</span>
            <span className="stat-value">{counts.filter((c) => c.status === 'reconciled').length}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>
            <Layers size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Líneas Auditadas</span>
            <span className="stat-value">{counts.reduce((a, c) => a + Number(c.total_lines || 0), 0)}</span>
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="filters-bar">
        <div className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número de conteo o bodega..."
          />
        </div>
        <div className="filter-group">
          <button className="btn-secondary" onClick={fetchCounts}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* Tabla de Conteos (table-card & data-table estándar ERP) */}
      <div className="table-card">
        {loading ? (
          <div className="loading-state">
            <RefreshCw size={24} className="spin" />
            <span>Cargando auditorías...</span>
          </div>
        ) : filteredCounts.length === 0 ? (
          <div className="empty-state">
            <ClipboardCheck size={48} />
            <h3>Sin conteos registrados</h3>
            <p>Comienza una toma física de inventario para auditar y conciliar existencias.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>N.º Conteo</th>
                <th>Bodega</th>
                <th>Modalidad</th>
                <th>Fecha de Corte</th>
                <th style={{ textAlign: 'center' }}>Posiciones</th>
                <th style={{ textAlign: 'center' }}>Diferencias</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredCounts.map((c) => {
                const isFrozen = c.status === 'counting';
                return (
                  <tr key={c.id} className="table-row">
                    <td>
                      <strong style={{ fontFamily: 'monospace' }}>{c.count_number}</strong>
                    </td>
                    <td>
                      <strong>{c.warehouse_name}</strong>
                    </td>
                    <td>
                      <span className="count-type-badge">
                        {c.count_type === 'full' ? 'Conteo General' : 'Conteo Cíclico'}
                      </span>
                    </td>
                    <td>
                      <span className="sub-text">{new Date(c.cut_off_date || c.created_at).toLocaleString()}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{c.total_lines || 0}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`variance-badge ${Number(c.variance_lines || 0) > 0 ? 'alert' : 'ok'}`}
                      >
                        {c.variance_lines || 0}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-pill ${isFrozen ? 'frozen' : 'reconciled'}`}>
                        {isFrozen ? <Lock size={12} /> : <Unlock size={12} />}
                        {isFrozen ? 'Congelado / En Conteo' : 'Reconciliado'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex' }}
                        onClick={() => handleOpenExistingCount(c.id)}
                      >
                        {isFrozen ? 'Continuar Conteo' : 'Ver Resultados'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ========================================================================= */}
      {/* WIZARD MODAL EN 4 PASOS (modal-overlay & modal-panel) */}
      {/* ========================================================================= */}
      {showWizard && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowWizard(false)}
        >
          <div className="modal-panel" style={{ maxWidth: 900 }}>
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h2>
                  <ClipboardCheck size={20} />
                  {currentCount ? currentCount.count_number : 'Nuevo Conteo de Inventario'}
                </h2>
                <span className="sub-text">
                  Toma física con corte de saldos y congelamiento transaccional de bodega
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowWizard(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Stepper Bar */}
            <div className="stepper-bar">
              <div
                className={`step-item ${activeStep >= 1 ? 'active' : ''} ${activeStep === 1 ? 'current' : ''}`}
                onClick={() => currentCount && setActiveStep(1)}
              >
                <span className="step-circle">1</span>
                <span className="step-label">1. Parámetros y Congelamiento</span>
              </div>
              <div
                className={`step-item ${activeStep >= 2 ? 'active' : ''} ${activeStep === 2 ? 'current' : ''}`}
                onClick={() => currentCount && setActiveStep(2)}
              >
                <span className="step-circle">2</span>
                <span className="step-label">2. Toma Física</span>
              </div>
              <div
                className={`step-item ${activeStep >= 3 ? 'active' : ''} ${activeStep === 3 ? 'current' : ''}`}
                onClick={() => currentCount && setActiveStep(3)}
              >
                <span className="step-circle">3</span>
                <span className="step-label">3. Conciliación & Discrepancias</span>
              </div>
              <div
                className={`step-item ${activeStep >= 4 ? 'active' : ''} ${activeStep === 4 ? 'current' : ''}`}
                onClick={() => currentCount && setActiveStep(4)}
              >
                <span className="step-circle">4</span>
                <span className="step-label">4. Regularización Automática</span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* PASO 1: PARÁMETROS */}
              {activeStep === 1 && (
                <form onSubmit={handleStartCount}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Bodega para la Auditoría *</label>
                      <select
                        required
                        value={createForm.warehouse_id}
                        onChange={(e) => setCreateForm({ ...createForm, warehouse_id: e.target.value })}
                        disabled={Boolean(currentCount)}
                      >
                        <option value="">Seleccione bodega...</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Modalidad de Conteo *</label>
                      <select
                        value={createForm.count_type}
                        onChange={(e) => setCreateForm({ ...createForm, count_type: e.target.value as any })}
                        disabled={Boolean(currentCount)}
                      >
                        <option value="full">Conteo General (Toda la Bodega)</option>
                        <option value="cyclic">Conteo Cíclico (Muestreo Selectivo)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label>Justificación y Notas de la Auditoría</label>
                    <textarea
                      placeholder="Cierre mensual, inventario semestral, auditoría de control interno..."
                      value={createForm.notes}
                      onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                      disabled={Boolean(currentCount)}
                      style={{
                        padding: 10,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        minHeight: 70,
                      }}
                    />
                  </div>

                  <div className="freeze-notice-box">
                    <input
                      type="checkbox"
                      id="freeze_locations_chk"
                      checked={createForm.freeze_locations}
                      onChange={(e) => setCreateForm({ ...createForm, freeze_locations: e.target.checked })}
                      disabled={Boolean(currentCount)}
                    />
                    <label htmlFor="freeze_locations_chk">
                      <strong>Activar Congelamiento Transaccional Temporal:</strong>
                      <span>
                        Bloquea inmediatamente las salidas comerciales y despachos de esta bodega mientras dure el conteo para garantizar un corte exacto y evitar discrepancias artificiales.
                      </span>
                    </label>
                  </div>

                  <div className="modal-footer" style={{ padding: '16px 0 0', marginTop: 20 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowWizard(false)}>
                      Cancelar
                    </button>
                    {currentCount ? (
                      <button
                        type="button"
                        className="btn-confirm"
                        onClick={() => setActiveStep(2)}
                      >
                        Continuar a Toma Física <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="btn-confirm"
                        disabled={busy || !createForm.warehouse_id}
                      >
                        {busy ? 'Iniciando...' : 'Iniciar Conteo y Congelar'} <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* PASO 2: TOMA FÍSICA */}
              {activeStep === 2 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span className="sub-text">
                      Ingrese la cantidad física real hallada en cada posición auditada.
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#064035' }}>
                      {countLines.length} posiciones en este corte
                    </span>
                  </div>

                  <div className="table-card" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Ubicación</th>
                          <th>Producto & SKU</th>
                          <th>Lote</th>
                          <th style={{ textAlign: 'right' }}>Cantidad Física Contada</th>
                          <th>Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {countLines.map((line, idx) => (
                          <tr key={line.id} className="table-row">
                            <td>
                              <strong style={{ fontFamily: 'monospace' }}>{line.location_code}</strong>
                            </td>
                            <td>
                              <strong>{line.product_name}</strong>
                              <span className="sub-text">{line.sku}</span>
                            </td>
                            <td>
                              <span className="lot-tag">{line.lot_number || 'Sin lote'}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                className="line-input"
                                value={line.counted_quantity ?? ''}
                                placeholder={String(line.expected_quantity)}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value);
                                  const nextLines = [...countLines];
                                  nextLines[idx].counted_quantity = val;
                                  setCountLines(nextLines);
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                placeholder="Empaque abierto, daño visible..."
                                className="line-obs-input"
                                value={line.reason || ''}
                                onChange={(e) => {
                                  const nextLines = [...countLines];
                                  nextLines[idx].reason = e.target.value;
                                  setCountLines(nextLines);
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="modal-footer" style={{ padding: '16px 0 0', marginTop: 20 }}>
                    <button type="button" className="btn-secondary" onClick={() => setActiveStep(1)}>
                      <ArrowLeft size={16} /> Parámetros
                    </button>
                    <button
                      type="button"
                      className="btn-confirm"
                      disabled={busy}
                      onClick={handleSavePhysicalLines}
                    >
                      {busy ? 'Guardando...' : 'Calcular Diferencias'} <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 3: CONCILIACIÓN & DIFERENCIAS */}
              {activeStep === 3 && (
                <div>
                  <div className="stats-grid" style={{ marginBottom: 16 }}>
                    <div className="stat-card">
                      <div className="stat-info">
                        <span className="stat-label">Posiciones con Diferencias</span>
                        <span className="stat-value" style={{ color: totalVariances > 0 ? '#ea580c' : '#059669' }}>
                          {totalVariances}
                        </span>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-info">
                        <span className="stat-label">Impacto Neto en Costo FIFO</span>
                        <span
                          className="stat-value"
                          style={{ color: netValuationImpact < 0 ? '#dc2626' : '#059669', fontFamily: 'monospace' }}
                        >
                          ${netValuationImpact.toFixed(2)} USD
                        </span>
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-info">
                        <span className="stat-label">Congelamiento Bodega</span>
                        <span className="stat-value" style={{ fontSize: '1rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Lock size={16} /> Activo
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="table-card" style={{ maxHeight: '44vh', overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Ubicación</th>
                          <th>Producto</th>
                          <th style={{ textAlign: 'right' }}>Sistema (Snapshot)</th>
                          <th style={{ textAlign: 'right' }}>Físico</th>
                          <th style={{ textAlign: 'right' }}>Diferencia</th>
                          <th style={{ textAlign: 'right' }}>Impacto FIFO</th>
                          <th>Causa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {countLines.map((line) => {
                          const variance = Number(
                            line.variance ??
                              Number(line.counted_quantity || 0) - Number(line.expected_quantity || 0),
                          );
                          const costImpact = variance * Number(line.unit_cost_fifo || 0);

                          return (
                            <tr key={line.id} className="table-row">
                              <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                {line.location_code}
                              </td>
                              <td>
                                <strong>{line.product_name}</strong>
                                <span className="sub-text">{line.sku}</span>
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {line.expected_quantity}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                {line.counted_quantity ?? line.expected_quantity}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span
                                  className={`diff-tag ${
                                    variance > 0 ? 'surplus' : variance < 0 ? 'shortage' : 'zero'
                                  }`}
                                >
                                  {variance > 0 ? `+${variance}` : variance}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                ${costImpact.toFixed(2)}
                              </td>
                              <td style={{ fontStyle: 'italic', color: 'var(--muted-foreground)' }}>
                                {line.reason || (variance === 0 ? 'Sin diferencia' : 'Pendiente justificación')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="modal-footer" style={{ padding: '16px 0 0', marginTop: 20 }}>
                    <button type="button" className="btn-secondary" onClick={() => setActiveStep(2)}>
                      <ArrowLeft size={16} /> Recontar Físico
                    </button>
                    <button
                      type="button"
                      className="btn-confirm"
                      disabled={busy || currentCount?.status === 'reconciled'}
                      onClick={handleReconcileAndAdjust}
                    >
                      {busy ? 'Aplicando Ajustes...' : 'Aprobar Conciliación y Aplicar FIFO'} <CheckCircle2 size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 4: CONFIRMACIÓN Y REGULARIZACIÓN */}
              {activeStep === 4 && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px' }}>
                    Conteo Conciliado y Regularizado
                  </h3>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', maxWidth: 480, margin: '0 auto 24px' }}>
                    Se han generado los movimientos inmutables de ajuste físico-contable con consumo y creación de capas FIFO correspondientes. El congelamiento transaccional de la bodega ha sido liberado automáticamente.
                  </p>

                  <div className="summary-box">
                    <div className="summary-row">
                      <span>Documento de Auditoría:</span>
                      <strong>{currentCount?.count_number}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Bodega Auditada:</span>
                      <strong>{currentCount?.warehouse_name}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Impacto Neto en Costo FIFO:</span>
                      <strong style={{ color: '#059669' }}>${netValuationImpact.toFixed(2)} USD</strong>
                    </div>
                    <div className="summary-row">
                      <span>Estado Final:</span>
                      <span className="status-pill reconciled">
                        <Unlock size={12} /> Descongelado & Reconciliado
                      </span>
                    </div>
                  </div>

                  <div className="modal-footer" style={{ padding: '24px 0 0', justifyContent: 'center' }}>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        setShowWizard(false);
                        fetchCounts();
                      }}
                    >
                      Cerrar Auditoría
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scoped CSS estándar ERP */}
      <style jsx>{`
        .inventory-counts-section {
          color: var(--foreground);
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 24px;
        }
        .section-header h2 {
          font-size: 1.35rem;
          font-weight: 800;
          margin: 0;
          color: var(--foreground);
        }
        .subtitle {
          color: var(--muted-foreground);
          font-size: 0.9rem;
          margin-top: 4px;
          max-width: 800px;
        }

        /* Métricas */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: var(--card);
          padding: 18px;
          border-radius: 12px;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--muted-foreground);
          display: block;
        }
        .stat-value {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--foreground);
        }

        /* Toolbar */
        .filters-bar {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          align-items: center;
          flex-wrap: wrap;
        }
        .search-box {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0 14px;
          height: 42px;
          min-width: 280px;
        }
        .search-box input {
          border: none;
          outline: none;
          width: 100%;
          font-size: 0.9rem;
          background: transparent;
          color: var(--foreground);
        }

        /* Tablas */
        .table-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow-x: auto;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th {
          background: var(--background);
          padding: 12px 16px;
          text-align: left;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--muted-foreground);
          border-bottom: 1px solid var(--border);
          font-weight: 700;
        }
        .table-row td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 0.88rem;
        }
        .table-row:hover td {
          background: var(--background);
        }

        .count-type-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 10px;
          background: var(--secondary);
          color: var(--muted-foreground);
        }
        .variance-badge {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 10px;
        }
        .variance-badge.ok {
          background: #ecfdf5;
          color: #059669;
        }
        .variance-badge.alert {
          background: #fef3c7;
          color: #d97706;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 12px;
        }
        .status-pill.frozen {
          background: #fff7ed;
          color: #ea580c;
        }
        .status-pill.reconciled {
          background: #ecfdf5;
          color: #059669;
        }

        .sub-text {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          display: block;
        }
        .lot-tag {
          font-family: monospace;
          font-size: 0.78rem;
          background: var(--secondary);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .diff-tag {
          font-family: monospace;
          font-weight: 700;
          font-size: 0.8rem;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .diff-tag.surplus {
          background: #ecfdf5;
          color: #059669;
        }
        .diff-tag.shortage {
          background: #fee2e2;
          color: #dc2626;
        }
        .diff-tag.zero {
          color: var(--muted-foreground);
        }

        /* Stepper */
        .stepper-bar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          padding: 12px 24px;
          background: var(--background);
          border-bottom: 1px solid var(--border);
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--muted-foreground);
          cursor: pointer;
          transition: 0.15s;
        }
        .step-item.active {
          color: var(--foreground);
        }
        .step-item.current {
          background: var(--card);
          color: #064035;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .step-circle {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--secondary);
          color: var(--muted-foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 800;
        }
        .step-item.active .step-circle {
          background: #064035;
          color: white;
        }

        /* Form Controls in Modal */
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--muted-foreground);
          text-transform: uppercase;
        }
        .form-group input,
        .form-group select {
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.9rem;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }

        .freeze-notice-box {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px;
          border-radius: 10px;
          background: var(--background);
          border: 1px solid var(--border);
        }
        .freeze-notice-box input {
          margin-top: 3px;
          width: 18px;
          height: 18px;
        }
        .freeze-notice-box label {
          font-size: 0.85rem;
          line-height: 1.4;
          cursor: pointer;
        }
        .freeze-notice-box label strong {
          display: block;
          color: var(--foreground);
          margin-bottom: 2px;
        }
        .freeze-notice-box label span {
          color: var(--muted-foreground);
        }

        .line-input {
          width: 100px;
          text-align: right;
          padding: 6px 10px;
          font-family: monospace;
          font-weight: 700;
          font-size: 0.85rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }
        .line-obs-input {
          width: 100%;
          padding: 6px 10px;
          font-size: 0.82rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          outline: none;
          background: var(--card);
          color: var(--foreground);
        }

        .summary-box {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px 20px;
          max-width: 440px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: left;
          font-size: 0.88rem;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .summary-row span {
          color: var(--muted-foreground);
        }

        /* Botones estándar ERP */
        .btn-primary {
          background: #064035;
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.9rem;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.2s;
        }
        .btn-primary:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .btn-confirm {
          background: #064035;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.15s;
        }
        .btn-confirm:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--foreground);
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: 0.15s;
        }
        .btn-secondary:hover {
          background: var(--background);
        }

        /* Modal Structure */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .modal-panel {
          background: var(--card);
          border-radius: 16px;
          width: 100%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        .modal-header {
          padding: 18px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--background);
        }
        .modal-header h2 {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--foreground);
        }
        .modal-close {
          border: none;
          background: transparent;
          color: var(--muted-foreground);
          cursor: pointer;
        }
        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .toast {
          padding: 12px 18px;
          border-radius: 8px;
          color: white;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.88rem;
          font-weight: 600;
        }
        .toast.ok {
          background: #059669;
        }
        .toast.err {
          background: #dc2626;
        }

        .empty-state {
          min-height: 240px;
          padding: 40px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--foreground);
        }
        .empty-state > svg {
          width: 28px;
          height: 28px;
          padding: 14px;
          border-radius: 16px;
          background: var(--secondary);
          color: #064035;
        }
        .empty-state h3 {
          margin: 16px 0 5px;
          color: var(--foreground);
          font-size: 1.1rem;
          font-weight: 750;
        }
        .empty-state p {
          margin: 0;
          max-width: 360px;
          color: var(--muted-foreground);
          font-size: 0.9rem;
        }
        .loading-state {
          padding: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--muted-foreground);
          font-size: 0.9rem;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .stepper-bar {
            grid-template-columns: repeat(2, 1fr);
          }
          .form-row {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 600px) {
          .section-header {
            flex-direction: column;
            align-items: stretch;
          }
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
