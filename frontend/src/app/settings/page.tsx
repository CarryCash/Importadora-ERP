'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus, Palette, RotateCcw, Save, Settings2 } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';
import { defaultSidebarModules, useTheme } from '../../components/ThemeProvider';

const modules = [
  ['dashboard', 'Panel de control', 'Indicadores, alertas y actividad reciente'],
  ['sales', 'Ventas y punto de venta', 'Transacciones, cotizaciones y devoluciones'],
  ['products', 'Productos', 'Catálogo, precios y datos comerciales'],
  ['inventory', 'Inventario', 'Existencias, lotes, movimientos y bodegas'],
  ['imports', 'Importaciones', 'Embarques, costos y recepción de mercancía'],
  ['logistics', 'Logística', 'Contenedores, rutas y entregas'],
  ['customers', 'Clientes', 'Cartera, datos y estados de cuenta'],
  ['suppliers', 'Proveedores', 'Directorio y abastecimiento'],
  ['finance', 'Finanzas', 'Gastos, balance y control financiero'],
  ['users', 'Equipo y usuarios', 'Cuentas, perfiles y roles'],
] as const;

type PermissionRow = { permission_key: string; module: string; description: string; role: string; allowed: boolean };
type CompanyRole = { role_key: string; display_name: string; description: string; is_system: boolean; member_count: number };

export default function SettingsPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const { theme, setThemeMode, preferences, updatePreferences } = useTheme();
  const [companyName, setCompanyName] = useState(preferences.companyName);
  const [logoDataUrl, setLogoDataUrl] = useState(preferences.logoDataUrl);
  const [brandColor, setBrandColor] = useState(preferences.brandColor);
  const [actionColor, setActionColor] = useState(preferences.actionColor);
  const [enabledModules, setEnabledModules] = useState(preferences.enabledModules);
  const [themeChoice, setThemeChoice] = useState(theme);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState('');
  const [permissionRows, setPermissionRows] = useState<PermissionRow[]>([]);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [selectedRole, setSelectedRole] = useState('sales');
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [newRole, setNewRole] = useState({ role_key: '', display_name: '', description: '' });
  const canAdmin=Boolean(user?.roles?.some((role)=>['admin','erp_admin'].includes(role))||user?.role==='admin');

  useEffect(() => {
    if (!isLoading && !canAdmin) router.replace('/dashboard');
  }, [isLoading, canAdmin, router]);

  useEffect(() => {
    setCompanyName(preferences.companyName);
    setLogoDataUrl(preferences.logoDataUrl);
    setBrandColor(preferences.brandColor);
    setActionColor(preferences.actionColor);
    setEnabledModules(preferences.enabledModules);
  }, [preferences]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/company/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo cargar la configuración.');
        setCompanyName(data.companyName || 'Importadora ERP');
        setLogoDataUrl(data.logoDataUrl || '');
        setBrandColor(data.brandColor || '#064035');
        setActionColor(data.actionColor || '#17365D');
        setEnabledModules(Array.isArray(data.enabledModules) ? data.enabledModules : [...defaultSidebarModules]);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Error de conexión.'))
      .finally(() => setLoadingSettings(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/company/roles', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudieron cargar los permisos.');
        setPermissionRows(data);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Error al cargar permisos.'));
  }, [token]);

  const loadRoles = async () => {
    if (!token) return;
    const response = await fetch('/api/company/roles/catalog', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudieron cargar los roles.');
    setRoles(data);
    if (!data.some((role: CompanyRole) => role.role_key === selectedRole)) {
      setSelectedRole(data.find((role: CompanyRole) => !role.is_system)?.role_key || 'sales');
    }
  };

  useEffect(() => {
    loadRoles().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Error al cargar roles.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setError('Usa una imagen PNG, JPG, WEBP o SVG.');
      event.target.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      setError('El logotipo debe pesar menos de 1 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result || ''));
    reader.onerror = () => setError('No pudimos leer el archivo de imagen.');
    reader.readAsDataURL(file);
  };

  const toggleModule = (moduleId: string) => {
    if (moduleId === 'dashboard') return;
    setEnabledModules((current) => current.includes(moduleId)
      ? current.filter((id) => id !== moduleId)
      : [...current, moduleId]);
  };

  const save = async () => {
    setError('');
    const cleanName = companyName.trim();
    if (!cleanName) {
      setError('Escribe el nombre del negocio.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/company/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyName: cleanName,
          logoDataUrl,
          brandColor,
          actionColor,
          enabledModules: [...new Set(['dashboard', ...enabledModules])],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo guardar la configuración.');
      updatePreferences({
        companyName: data.companyName,
        logoDataUrl: data.logoDataUrl,
        brandColor: data.brandColor,
        actionColor: data.actionColor,
        enabledModules: data.enabledModules,
      });
      setThemeMode(themeChoice);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Error de conexión.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setError('');
    setSaving(true);
    try {
      const response = await fetch('/api/company/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyName: 'Importadora ERP', logoDataUrl: '', brandColor: '#064035', actionColor: '#17365D', enabledModules: [...defaultSidebarModules] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo restablecer la configuración.');
      updatePreferences({ companyName: data.companyName, logoDataUrl: data.logoDataUrl, brandColor: data.brandColor, actionColor: data.actionColor, enabledModules: data.enabledModules });
      setThemeMode('light');
      setCompanyName(data.companyName);
      setLogoDataUrl(data.logoDataUrl);
      setBrandColor(data.brandColor);
      setActionColor(data.actionColor || '#17365D');
      setEnabledModules(data.enabledModules);
      setThemeChoice('light');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Error de conexión.');
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (permissionKey: string) => {
    setPermissionRows((current) => current.map((row) => row.role === selectedRole && row.permission_key === permissionKey
      ? { ...row, allowed: !row.allowed }
      : row));
  };

  const saveRolePermissions = async () => {
    setSavingPermissions(true);
    setError('');
    try {
      const permissionKeys = permissionRows.filter((row) => row.role === selectedRole && row.allowed).map((row) => row.permission_key);
      const response = await fetch(`/api/company/roles/${selectedRole}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissionKeys }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudieron guardar los permisos.');
      setPermissionRows(data);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : 'Error al guardar permisos.');
    } finally {
      setSavingPermissions(false);
    }
  };

  const createRole = async () => {
    setError('');
    try {
      const response = await fetch('/api/company/roles', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newRole) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo crear el rol.');
      await loadRoles();
      setSelectedRole(data.role_key);
      setNewRole({ role_key: '', display_name: '', description: '' });
      const refreshed = await fetch('/api/company/roles', { headers: { Authorization: `Bearer ${token}` } });
      if (refreshed.ok) setPermissionRows(await refreshed.json());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Error al crear el rol.');
    }
  };

  const deleteRole = async (role: CompanyRole) => {
    if (!window.confirm(`¿Eliminar el rol «${role.display_name}»?`)) return;
    setError('');
    try {
      const response = await fetch(`/api/company/roles/${role.role_key}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo eliminar el rol.');
      await loadRoles();
      const refreshed = await fetch('/api/company/roles', { headers: { Authorization: `Bearer ${token}` } });
      if (refreshed.ok) setPermissionRows(await refreshed.json());
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Error al eliminar el rol.');
    }
  };

  if (isLoading || loadingSettings || !canAdmin) return <div className="settings-loading">Cargando configuración…</div>;

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="dashboard-content settings-page">
        <header className="settings-page-heading">
          <div><p className="eyebrow">ADMINISTRACIÓN DEL ESPACIO</p><h1>Configuración del panel</h1><p>Adapta la identidad visual y la navegación al negocio.</p></div>
          <span className="settings-heading-icon"><Settings2 size={23} /></span>
        </header>

        <section className="settings-card">
          <div className="settings-card-heading"><span className="settings-section-icon"><ImagePlus size={19} /></span><div><h2>Identidad del negocio</h2><p>El nombre y el logotipo aparecerán en la navegación del sistema.</p></div></div>
          <div className="settings-form-grid brand-settings-grid">
            <label className="settings-field"><span>Nombre del negocio</span><input value={companyName} maxLength={60} onChange={(event) => setCompanyName(event.target.value)} placeholder="Ej. Importadora del Pacífico" /></label>
            <div className="settings-field"><span>Logotipo</span><div className="logo-upload-row"><div className="logo-preview">{logoDataUrl ? <img src={logoDataUrl} alt="Vista previa del logotipo" /> : <span>{companyName.trim().charAt(0).toUpperCase() || 'I'}</span>}</div><label className="settings-secondary-button">Elegir imagen<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogo} hidden /></label>{logoDataUrl && <button type="button" className="settings-text-button" onClick={() => setLogoDataUrl('')}>Quitar logo</button>}</div><small>PNG, JPG, WEBP o SVG · máximo 1 MB.</small></div>
            <label className="settings-field"><span><Palette size={15} /> Color de navegación</span><div className="color-control"><input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} /><code>{brandColor.toUpperCase()}</code><div className="brand-color-presets">{['#064035', '#123B67', '#4C286B', '#8B3A28'].map((color) => <button key={color} type="button" aria-label={`Usar color ${color}`} style={{ backgroundColor: color }} onClick={() => setBrandColor(color)} />)}</div></div></label>
            <label className="settings-field"><span><Palette size={15} /> Color de botones en todas las ventanas</span><div className="color-control"><input type="color" value={actionColor} onChange={(event) => setActionColor(event.target.value)} /><code>{actionColor.toUpperCase()}</code><div className="brand-color-presets action-color-presets">{['#17365D', '#B42318', '#047857', '#6D28D9', '#0F766E'].map((color) => <button key={color} type="button" aria-label={`Usar color de botones ${color}`} style={{ backgroundColor: color }} onClick={() => setActionColor(color)} />)}</div></div><button type="button" className="settings-primary-button action-color-preview" style={{ backgroundColor: actionColor, borderColor: actionColor }}>Vista previa de botón</button><small>Este color afecta las acciones principales del sistema y no modifica el sidebar.</small></label>
            <label className="settings-field"><span>Tema del panel</span><select value={themeChoice} onChange={(event) => setThemeChoice(event.target.value as 'light' | 'dark')}><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading"><span className="settings-section-icon"><Settings2 size={19} /></span><div><h2>Roles de la empresa</h2><p>Crea perfiles de acceso. Reasigna a sus usuarios antes de eliminar un rol.</p></div></div>
          <div className="role-catalog-list">{roles.map((role) => <div className="role-catalog-row" key={role.role_key}><div><strong>{role.display_name}</strong><small>{role.role_key} · {role.member_count} usuario{role.member_count === 1 ? '' : 's'}{role.is_system ? ' · sistema' : ''}</small></div>{!role.is_system && <button type="button" className="settings-text-button" onClick={() => void deleteRole(role)}>Eliminar</button>}</div>)}</div>
          <div className="role-create-row"><label className="settings-field"><span>Código (ej. compras)</span><input value={newRole.role_key} maxLength={30} onChange={(event) => setNewRole({ ...newRole, role_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></label><label className="settings-field"><span>Nombre visible</span><input value={newRole.display_name} maxLength={80} onChange={(event) => setNewRole({ ...newRole, display_name: event.target.value })} /></label><label className="settings-field"><span>Descripción</span><input value={newRole.description} maxLength={240} onChange={(event) => setNewRole({ ...newRole, description: event.target.value })} /></label><button type="button" className="settings-primary-button" onClick={() => void createRole()} disabled={!newRole.role_key || !newRole.display_name}>Crear rol</button></div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading"><span className="settings-section-icon"><Settings2 size={19} /></span><div><h2>Permisos por rol</h2><p>Define qué operaciones puede ejecutar cada perfil. El rol administrador conserva acceso total.</p></div></div>
          <label className="settings-field permission-role-select"><span>Perfil que vas a configurar</span><select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>{roles.filter((role) => role.role_key !== 'admin').map((role) => <option key={role.role_key} value={role.role_key}>{role.display_name}</option>)}</select></label>
          <div className="permission-list">
            {permissionRows.filter((row) => row.role === selectedRole).map((row) => <label className="permission-row" key={row.permission_key}><input type="checkbox" checked={row.allowed} onChange={() => togglePermission(row.permission_key)} /><span className="permission-row-copy"><strong>{row.description}</strong><small>{row.module} · {row.permission_key}</small></span><span className={`permission-state ${row.allowed ? 'allowed' : ''}`}>{row.allowed ? 'Permitido' : 'Bloqueado'}</span></label>)}
            {permissionRows.length === 0 && <p className="settings-loading">Cargando permisos…</p>}
          </div>
          <div className="settings-actions permission-actions"><button type="button" className="settings-primary-button" onClick={saveRolePermissions} disabled={savingPermissions || permissionRows.length === 0}><Save size={16} />{savingPermissions ? 'Guardando…' : 'Guardar permisos'}</button></div>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading"><span className="settings-section-icon"><Settings2 size={19} /></span><div><h2>Módulos visibles</h2><p>Organiza qué secciones aparecen en el menú lateral. Esto no modifica los permisos de acceso de cada rol.</p></div></div>
          <div className="module-settings-list">
            {modules.map(([id, title, description]) => {
              const checked = enabledModules.includes(id);
              return <label className="module-setting-row" key={id}><span className={`module-check ${checked ? 'checked' : ''}`}>{checked && <Check size={14} />}</span><input type="checkbox" checked={checked} disabled={id === 'dashboard'} onChange={() => toggleModule(id)} /><span className="module-setting-copy"><strong>{title}</strong><small>{description}</small></span><span className="module-setting-state">{id === 'dashboard' ? 'Principal' : checked ? 'Visible' : 'Oculto'}</span></label>;
            })}
          </div>
        </section>

        <div className="settings-bottom-row">
          <p className="settings-local-note">El color del menú y de los botones se guarda para toda la empresa. El tema claro/oscuro es personal.</p>
          <div className="settings-actions"><button type="button" className="settings-secondary-button" onClick={reset} disabled={saving}><RotateCcw size={16} />Restablecer</button><button type="button" className="settings-primary-button" onClick={save} disabled={saving}><Save size={17} />{saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar cambios'}</button></div>
        </div>
        {error && <p className="settings-message error">{error}</p>}
        {saved && <p className="settings-message success">La apariencia del panel se actualizó correctamente.</p>}
      </main>
    </div>
  );
}
