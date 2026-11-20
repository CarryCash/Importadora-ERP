'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Save, UserRound } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../components/AuthProvider';

export default function ProfilePage() {
  const { token, user, updateUser, isLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ full_name: '', email: '', current_password: '', new_password: '', confirm_password: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mfa,setMfa]=useState({enabled:false,secret:'',code:''});
  const [sessions,setSessions]=useState<any[]>([]);

  useEffect(() => {
    if (!isLoading && !token) router.replace('/login');
  }, [isLoading, token, router]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el perfil.');
        const profile = await response.json();
        setForm((current) => ({ ...current, full_name: profile.full_name || '', email: profile.email || '' }));
      })
      .catch((error) => setMessage({ type: 'error', text: error.message }))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(()=>{if(!token)return;fetch('/api/security/mfa',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():null).then(data=>{if(data)setMfa(current=>({...current,enabled:Boolean(data.enabled)}));}).catch(()=>{});},[token]);
  useEffect(()=>{if(!token)return;fetch('/api/security/my-sessions',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():[]).then(setSessions).catch(()=>{});},[token]);

  const startMfa=async()=>{try{const response=await fetch('/api/security/mfa/setup',{method:'POST',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo iniciar la configuración.');setMfa(current=>({...current,secret:data.secret,code:''}));setMessage({type:'success',text:'Agrega esta clave en tu aplicación de autenticación y confirma con el código de seis dígitos.'});}catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Error de conexión.'});}};
  const verifyMfa=async()=>{try{const response=await fetch('/api/security/mfa/verify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({code:mfa.code})});const data=await response.json();if(!response.ok)throw new Error(data.message||'Código incorrecto.');setMfa(current=>({...current,enabled:true,secret:'',code:''}));setMessage({type:'success',text:'Autenticación multifactor activada.'});}catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Error de conexión.'});}};
  const disableMfa=async()=>{try{const response=await fetch('/api/security/mfa',{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo desactivar MFA.');setMfa({enabled:false,secret:'',code:''});setMessage({type:'success',text:'Autenticación multifactor desactivada.'});}catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Error de conexión.'});}};
  const revokeSession=async(id:string)=>{try{const response=await fetch(`/api/security/my-sessions/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo cerrar la sesión.');setSessions(current=>current.filter(session=>session.id!==id));setMessage({type:'success',text:'La sesión fue cerrada.'});}catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Error de conexión.'});}};

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (form.new_password && form.new_password !== form.confirm_password) {
      setMessage({ type: 'error', text: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          current_password: form.current_password || undefined,
          new_password: form.new_password || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'No se pudo guardar el perfil.');
      updateUser({ full_name: result.full_name, email: result.email });
      setForm((current) => ({ ...current, current_password: '', new_password: '', confirm_password: '' }));
      setMessage({ type: 'success', text: 'Perfil actualizado correctamente.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Error de conexión.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="dashboard-content profile-page">
        <header className="profile-page-heading">
          <div><p className="eyebrow">CUENTA PERSONAL</p><h1>Mi perfil</h1><p>Actualiza tus datos y protege el acceso a tu cuenta.</p></div>
          <div className="profile-page-avatar"><UserRound size={28} /></div>
        </header>
        {loading ? <div className="settings-loading">Cargando perfil…</div> : (
          <form className="profile-form-card" onSubmit={save}>
            <div className="profile-form-section"><div><h2>Información personal</h2><p>Usuario: <strong>{user?.username}</strong></p></div></div>
            <div className="settings-form-grid">
              <label className="settings-field"><span>Nombre completo</span><input required maxLength={100} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
              <label className="settings-field"><span>Correo electrónico</span><input required type="email" maxLength={100} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            </div>
            <div className="profile-form-section profile-password-heading"><div><h2><KeyRound size={18} /> Cambiar contraseña</h2><p>Deja estos campos vacíos si no deseas cambiarla.</p></div></div>
            <div className="settings-form-grid">
              <label className="settings-field"><span>Contraseña actual</span><input type="password" autoComplete="current-password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} /></label>
              <span />
              <label className="settings-field"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" minLength={8} value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} /></label>
              <label className="settings-field"><span>Confirmar nueva contraseña</span><input type="password" autoComplete="new-password" minLength={8} value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} /></label>
            </div>
            <div className="profile-form-section profile-password-heading"><div><h2><KeyRound size={18} /> Autenticación multifactor</h2><p>{mfa.enabled?'Tu cuenta pide un código temporal al iniciar sesión.':'Agrega una segunda verificación desde una aplicación compatible con TOTP.'}</p></div></div>
            {!mfa.enabled&&!mfa.secret&&<div className="settings-actions"><button type="button" className="settings-secondary-button" onClick={()=>void startMfa()}>Configurar MFA</button></div>}
            {mfa.secret&&<div className="mfa-enrollment"><p>Clave secreta para agregar manualmente a tu app:</p><code>{mfa.secret}</code><label className="settings-field"><span>Código de verificación</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfa.code} onChange={e=>setMfa({...mfa,code:e.target.value.replace(/\D/g,'').slice(0,6)})}/></label><button type="button" className="settings-primary-button" disabled={mfa.code.length!==6} onClick={()=>void verifyMfa()}>Confirmar MFA</button></div>}
            {mfa.enabled&&<div className="settings-actions"><button type="button" className="settings-secondary-button" onClick={()=>void disableMfa()}>Desactivar MFA</button></div>}
            <div className="profile-form-section profile-password-heading"><div><h2>Sesiones y dispositivos</h2><p>Revisa tus accesos activos y cierra los que ya no reconoces.</p></div></div>
            <div className="profile-sessions">{sessions.map(session=><div className="profile-session-row" key={session.id}><div><strong>{session.user_agent||'Dispositivo sin identificar'}</strong><small>{session.ip_address||'IP no disponible'} · última actividad {new Date(session.last_seen_at).toLocaleString('es-EC')}</small></div><button type="button" className="settings-text-button" onClick={()=>void revokeSession(session.id)}>Cerrar sesión</button></div>)}{!sessions.length&&<p>No hay sesiones activas registradas.</p>}</div>
            {message && <p className={`settings-message ${message.type}`}>{message.text}</p>}
            <div className="settings-actions"><button className="settings-primary-button" disabled={saving}><Save size={17} />{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
          </form>
        )}
      </main>
    </div>
  );
}
