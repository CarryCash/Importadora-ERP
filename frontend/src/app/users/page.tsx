'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Navbar from '../../components/Navbar';
import { 
  Users, UserPlus, Shield, MapPin, 
  Mail, Phone, Clock, RefreshCw, X, 
  CheckCircle, AlertCircle, Edit2, 
  Trash2, User, Key, Building2,
  MoreVertical, Power, Search
} from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  warehouse_name?: string;
  last_login?: string;
  created_at: string;
}

interface Warehouse {
  id: string;
  name: string;
}

const API = 'http://localhost:3000/api';

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // -- Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    username: '', full_name: '', email: '', password: '', 
    role: 'user', assigned_warehouse_id: '', is_active: true
  });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, wRes] = await Promise.all([
        fetch(`${API}/users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`${API}/inventory/warehouses`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);
      
      if (uRes.ok) setUsers(await uRes.json());
      if (wRes.ok) setWarehouses(await wRes.json());
    } catch (err) {
      console.error('Error fetching team data:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      'admin': 'Administrador',
      'warehouse': 'Bodeguero',
      'sales': 'Vendedor',
      'user': 'Usuario'
    };
    return roles[role] || role;
  };

  const handleOpenModal = (user?: UserData) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        password: '', // Don't show password
        role: user.role,
        assigned_warehouse_id: warehouses.find(w => w.name === user.warehouse_name)?.id || '',
        is_active: user.is_active
      });
    } else {
      setEditingUser(null);
      setFormData({
        username: '', full_name: '', email: '', password: '', 
        role: 'user', assigned_warehouse_id: '', is_active: true
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingUser ? `${API}/users/${editingUser.id}` : `${API}/users`;
      const method = editingUser ? 'PUT' : 'POST';
      
      const payload = { ...formData };
      if (editingUser && !payload.password) delete (payload as any).password;

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(editingUser ? 'Usuario actualizado con éxito' : '¡Usuario creado exitosamente!');
        setShowModal(false);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`Error: ${errorData.message || 'No se pudo guardar el usuario'}`);
      }
    } catch (err) {
      console.error('Error saving user:', err);
      alert('Error de conexión con el servidor');
    }
    setSaving(false);
  };

  const toggleStatus = async (user: UserData) => {
    try {
      const res = await fetch(`${API}/users/${user.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ ...user, is_active: !user.is_active })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <Navbar />
      
      <div className="main-content" style={{ padding: '32px 40px' }}>
        <div className="header-row">
          <div>
            <h1 className="title">Gestión de Equipo</h1>
            <p className="subtitle">Administración de usuarios, roles y accesos operativos</p>
          </div>
          <button className="btn-create" onClick={() => handleOpenModal()}>
            <UserPlus size={18} /> Invitar Usuario
          </button>
        </div>

        {/* Filters */}
        <div className="filter-row" style={{ marginBottom: 32 }}>
          <div className="search-box">
            <Search size={18} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, usuario o email..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Team Grid */}
        {loading ? (
          <div className="loading-state">
            <RefreshCw size={40} className="spin" color="var(--border)" />
          </div>
        ) : (
          <div className="team-grid">
            {filteredUsers.map(u => (
              <div key={u.id} className={`user-card ${!u.is_active ? 'inactive' : ''}`}>
                <div className="card-top">
                  <div className="user-avatar">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.full_name} />
                    ) : (
                      <div className="avatar-placeholder">{u.full_name.charAt(0)}</div>
                    )}
                    <div className={`status-dot ${u.is_active ? 'online' : 'offline'}`}></div>
                  </div>
                  <div className="card-actions">
                    <button className="icon-btn" onClick={() => handleOpenModal(u)}><Edit2 size={16} /></button>
                    <button 
                      className={`icon-btn ${u.is_active ? 'deactivate' : 'activate'}`} 
                      onClick={() => toggleStatus(u)}
                      title={u.is_active ? 'Desactivar Cuenta' : 'Activar Cuenta'}
                    >
                      <Power size={16} />
                    </button>
                  </div>
                </div>

                <div className="user-info">
                  <h3 className="u-name">{u.full_name}</h3>
                  <span className="u-username">@{u.username}</span>
                  
                  <div className="role-badge-row">
                    <span className={`role-badge ${u.role}`}>
                      <Shield size={12} /> {getRoleLabel(u.role).toUpperCase()}
                    </span>
                    {!u.is_active && <span className="inactive-badge">INACTIVO</span>}
                  </div>
                </div>

                <div className="user-details">
                  <div className="d-row"><Mail size={14} /> {u.email}</div>
                  <div className="d-row">
                    <Building2 size={14} /> 
                    {u.warehouse_name ? <span>Bodega: <strong>{u.warehouse_name}</strong></span> : <span className="null-val">Sin Bodega Asignada</span>}
                  </div>
                  <div className="d-row"><Clock size={14} /> {u.last_login ? `Último acceso: ${new Date(u.last_login).toLocaleDateString()}` : 'Nunca accedió'}</div>
                </div>

                <div className="card-footer">
                   <div className="join-date">Miembro desde {new Date(u.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal-panel">
              <div className="modal-header">
                <h2>{editingUser ? 'Editar Miembro del Equipo' : 'Invitar Nuevo Miembro'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Nombre Completo</label>
                      <input 
                        required
                        value={formData.full_name} 
                        onChange={e => setFormData({...formData, full_name: e.target.value})} 
                        placeholder="Ej. Juan Pérez"
                      />
                    </div>
                    <div className="form-group">
                      <label>Nombre de Usuario</label>
                      <input 
                        required
                        disabled={!!editingUser}
                        value={formData.username} 
                        onChange={e => setFormData({...formData, username: e.target.value})} 
                        placeholder="ej. juan.perez"
                      />
                    </div>
                    <div className="form-group">
                      <label>Correo Electrónico</label>
                      <input 
                        required
                        type="email"
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        placeholder="correo@empresa.com"
                      />
                    </div>
                    <div className="form-group">
                      <label>{editingUser ? 'Nueva Contraseña (Opcional)' : 'Contraseña Inicial'}</label>
                      <input 
                        required={!editingUser}
                        type="password"
                        value={formData.password} 
                        onChange={e => setFormData({...formData, password: e.target.value})} 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>Rol en el Sistema</label>
                      <select required value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                        <option value="admin">Administrador (Acceso Total)</option>
                        <option value="sales">Vendedor (Solo Ventas/Cientes)</option>
                        <option value="warehouse">Bodeguero (Solo Inventario)</option>
                        <option value="user">Usuario Estándar (Lectura)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Bodega Asignada</label>
                      <select value={formData.assigned_warehouse_id} onChange={e => setFormData({...formData, assigned_warehouse_id: e.target.value})}>
                        <option value="">-- Sin Asignación (Acceso Global) --</option>
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn-save" disabled={saving}>
                    {saving ? 'Guardando...' : editingUser ? 'Actualizar Miembro' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
        .title { font-size: 1.875rem; font-weight: 800; color: var(--foreground); letter-spacing: -0.025em; margin-bottom: 4px; }
        .subtitle { color: var(--muted-foreground); font-size: 0.95rem; }

        .btn-create { background: var(--foreground); color: white; border: none; padding: 12px 24px; border-radius: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; }
        .btn-create:hover { background: var(--foreground); transform: translateY(-1px); }

        .search-box { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 0 16px; display: flex; align-items: center; gap: 12px; height: 52px; max-width: 450px; transition: 0.2s; }
        .search-box:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
        .search-box input { border: none; outline: none; width: 100%; font-size: 0.95rem; background: transparent; color: var(--foreground); }

        .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
        
        .user-card { background: var(--card); border-radius: 28px; border: 1px solid var(--border); padding: 24px; display: flex; flex-direction: column; transition: 0.3s; position: relative; }
        .user-card:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -8px rgba(0,0,0,0.05); }
        .user-card.inactive { opacity: 0.7; grayscale: 0.5; }

        .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .user-avatar { width: 64px; height: 64px; position: relative; }
        .avatar-placeholder { width: 100%; height: 100%; background: var(--secondary); color: #94a3b8; border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .status-dot { width: 14px; height: 14px; border: 3px solid white; border-radius: 50%; position: absolute; bottom: 0; right: 0; }
        .status-dot.online { background: #10b981; }
        .status-dot.offline { background: #94a3b8; }

        .card-actions { display: flex; gap: 8px; }
        .icon-btn { width: 36px; height: 36px; border-radius: 12px; border: none; background: var(--background); color: var(--muted-foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .icon-btn:hover { background: var(--secondary); color: var(--foreground); }
        .icon-btn.deactivate:hover { background: #fee2e2; color: #ef4444; }
        .icon-btn.activate:hover { background: #ecfdf5; color: #10b981; }

        .u-name { font-size: 1.2rem; font-weight: 800; color: var(--foreground); margin: 0; }
        .u-username { font-size: 0.85rem; color: #94a3b8; font-weight: 500; }

        .role-badge-row { margin: 12px 0 20px; display: flex; align-items: center; gap: 10px; }
        .role-badge { padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; gap: 6px; letter-spacing: 0.05em; }
        .role-badge.admin { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
        .role-badge.sales { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .role-badge.warehouse { background: #eff6ff; color: #2563eb; border: 1px solid #dbeafe; }
        .role-badge.user { background: var(--background); color: var(--muted-foreground); border: 1px solid var(--border); }
        .inactive-badge { background: var(--secondary); color: #94a3b8; font-size: 0.65rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; }

        .user-details { border-top: 1px solid var(--muted); padding: 20px 0; display: flex; flex-direction: column; gap: 12px; flex: 1; }
        .d-row { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: var(--muted-foreground); }
        .null-val { font-style: italic; color: var(--border); }

        .card-footer { padding-top: 16px; border-top: 1px solid var(--muted); }
        .join-date { font-size: 0.75rem; color: #94a3b8; font-weight: 500; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .modal-panel { background: var(--card); width: 100%; max-width: 600px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
        .modal-header { padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 1.25rem; font-weight: 800; color: var(--foreground); }
        .modal-close { background: none; border: none; color: var(--border); cursor: pointer; transition: 0.2s; }
        .modal-close:hover { color: var(--foreground); }

        .modal-body { padding: 32px; max-height: 75vh; overflow-y: auto; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-size: 0.85rem; font-weight: 700; color: var(--muted-foreground); }
        .form-group input, .form-group select { padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; outline: none; transition: 0.2s; font-size: 0.95rem; }
        .form-group input:focus { border-color: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }

        .modal-footer { padding: 24px 32px; background: var(--background); display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--secondary); }
        .btn-cancel { background: var(--card); border: 1px solid var(--border); padding: 10px 20px; border-radius: 12px; color: var(--muted-foreground); font-weight: 600; cursor: pointer; }
        .btn-save { background: var(--foreground); color: white; border: none; padding: 10px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; }

        .loading-state { height: 400px; display: flex; align-items: center; justify-content: center; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
