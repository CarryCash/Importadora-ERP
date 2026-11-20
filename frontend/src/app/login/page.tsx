'use client';

import React, { useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useTheme } from '../../components/ThemeProvider';
import { Moon, Sun } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp,setOtp]=useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme, preferences } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, otp }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.access_token, data.user);
      } else {
        setError(data.message || 'Error de autenticación');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-card">
        <div className="login-header">
          {preferences.logoDataUrl && <img src={preferences.logoDataUrl} alt="" style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 12, borderRadius: 12 }} />}
          <h1>{preferences.companyName}</h1>
          <p>Bienvenido, por favor inicia sesión</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: admin"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="otp">Código MFA (si está activado)</label>
            <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Cargando...' : 'Entrar al Sistema'}
          </button>
        </form>

        <div className="theme-toggle-container">
          <button onClick={toggleTheme} className="theme-toggle">
            {theme === 'light' ? <><Moon size={16} /> Modo Oscuro</> : <><Sun size={16} /> Modo Claro</>}
          </button>
        </div>
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, var(--background) 0%, var(--secondary) 100%);
          padding: 20px;
        }

        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 40px;
          text-align: center;
        }

        .login-header h1 {
          font-size: 2rem;
          margin-bottom: 8px;
          color: var(--primary);
        }

        .login-header p {
          color: var(--muted-foreground);
          font-size: 0.9rem;
          margin-bottom: 30px;
        }

        .login-form {
          text-align: left;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--foreground);
        }

        .form-group input {
          width: 100%;
          padding: 12px 16px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          border-color: var(--primary);
        }

        .error-message {
          color: var(--destructive);
          font-size: 0.85rem;
          margin-bottom: 20px;
          text-align: center;
        }

        .login-button {
          width: 100%;
          padding: 14px;
          border-radius: var(--radius);
          background: var(--brand-surface);
          color: var(--primary-foreground);
          font-weight: 600;
          font-size: 1rem;
          margin-top: 10px;
          transition: opacity 0.2s;
        }

        .login-button:hover {
          opacity: 0.9;
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .theme-toggle-container {
          margin-top: 40px;
          border-top: 1px solid var(--border);
          padding-top: 20px;
        }

        .theme-toggle {
          background: none;
          color: var(--muted-foreground);
          font-size: 0.85rem;
          padding: 8px 16px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
        }

        .theme-toggle:hover {
          background: var(--accent);
          color: var(--accent-foreground);
        }
      `}</style>
    </div>
  );
}
