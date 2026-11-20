'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

type Theme = 'light' | 'dark';

export const defaultSidebarModules = [
  'dashboard', 'logistics', 'products', 'inventory', 'sales', 'imports',
  'customers', 'suppliers', 'finance', 'users',
];

interface WorkspacePreferences {
  companyName: string;
  logoDataUrl: string;
  brandColor: string;
  actionColor: string;
  enabledModules: string[];
}

const defaultPreferences: WorkspacePreferences = {
  companyName: 'Importadora ERP',
  logoDataUrl: '',
  brandColor: '#064035',
  actionColor: '#17365D',
  enabledModules: defaultSidebarModules,
};

function applyActionColor(color: string) {
  document.documentElement.style.setProperty('--action-color', color);
  const channels = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)?.slice(1).map(value => parseInt(value, 16) / 255);
  if (!channels) return;
  const luminance = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  document.documentElement.style.setProperty('--primary-foreground', luminance > .42 ? '#102033' : '#ffffff');
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setThemeMode: (theme: Theme) => void;
  preferences: WorkspacePreferences;
  updatePreferences: (patch: Partial<WorkspacePreferences>) => void;
  resetPreferences: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { token, user, updateUser } = useAuth();
  const [theme, setTheme] = useState<Theme>('light');
  const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultPreferences);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    const preferenceKey = user?.company_id ? `workspace-preferences:${user.company_id}` : 'workspace-preferences';
    const savedPreferences = localStorage.getItem(preferenceKey) || localStorage.getItem('workspace-preferences');
    if (savedPreferences) {
      try {
        const nextPreferences = { ...defaultPreferences, ...JSON.parse(savedPreferences) };
        setPreferences(nextPreferences);
        document.documentElement.style.setProperty('--brand-bg', nextPreferences.brandColor);
        applyActionColor(nextPreferences.actionColor);
      } catch {
        localStorage.removeItem('workspace-preferences');
      }
    }
  }, [user?.company_id]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/company/settings', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const settings = await response.json();
      const nextPreferences = {
        companyName: settings.companyName || defaultPreferences.companyName,
        logoDataUrl: settings.logoDataUrl || '',
        brandColor: settings.brandColor || defaultPreferences.brandColor,
        actionColor: settings.actionColor || defaultPreferences.actionColor,
        enabledModules: Array.isArray(settings.enabledModules) ? settings.enabledModules : defaultSidebarModules,
      };
      setPreferences(nextPreferences);
      document.documentElement.style.setProperty('--brand-bg', nextPreferences.brandColor);
      applyActionColor(nextPreferences.actionColor);
      updateUser({ company_id: settings.company_id });
      localStorage.setItem(`workspace-preferences:${settings.company_id}`, JSON.stringify(nextPreferences));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [token, updateUser]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const setThemeMode = (nextTheme: Theme) => {
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const updatePreferences = (patch: Partial<WorkspacePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      const key = user?.company_id ? `workspace-preferences:${user.company_id}` : 'workspace-preferences';
      localStorage.setItem(key, JSON.stringify(next));
      document.documentElement.style.setProperty('--brand-bg', next.brandColor);
      applyActionColor(next.actionColor);
      return next;
    });
  };

  const resetPreferences = () => {
    setPreferences(defaultPreferences);
    const key = user?.company_id ? `workspace-preferences:${user.company_id}` : 'workspace-preferences';
    localStorage.removeItem(key);
    document.documentElement.style.setProperty('--brand-bg', defaultPreferences.brandColor);
    applyActionColor(defaultPreferences.actionColor);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeMode, preferences, updatePreferences, resetPreferences }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
