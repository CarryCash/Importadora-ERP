'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id?: string;
  username: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  company_id?: string;
  branch_id?: string;
  permissions?: string[];
  role?: string;
  roles?: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');

      if (!savedToken || !savedUser) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return;
      }

      const parsedUser: unknown = JSON.parse(savedUser);
      if (!parsedUser || typeof parsedUser !== 'object' || !('username' in parsedUser)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return;
      }

      setToken(savedToken);
      setUser(parsedUser as User);
    } catch {
      // A malformed or inaccessible local session must never keep the app on
      // the startup screen. Discard it and let the route guard send the user
      // to sign in again.
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } catch {
        // Storage can be disabled by the browser; in-memory auth stays empty.
      }
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    router.push('/dashboard');
  };

  const logout = () => {
    if (token) void fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...updates };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, updateUser, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
