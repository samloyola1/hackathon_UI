import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * App-wide settings store.
 *
 * - Holds all Command Center preferences in one place.
 * - Applies the selected theme (dark / light / system) to the document
 *   immediately so it takes effect across every page.
 * - Persists to localStorage on save so choices survive reloads.
 */

const STORAGE_KEY = 'cc-settings';

const defaultSettings = {
  orgName: 'Hackathon Team',
  theme: 'dark',
  notifications: true,
  emailAlerts: true,
  smsAlerts: false,
  alertThreshold: 'medium',
  refreshRate: 5,
  aiRecommendations: true,
};

const SettingsContext = createContext(null);

/** Resolve 'system' to the OS preference; otherwise return the theme as-is. */
function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }
  return theme;
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  // Apply the theme to <html data-theme="..."> whenever it changes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(settings.theme));
  }, [settings.theme]);

  // When following the system theme, react to OS light/dark changes live.
  useEffect(() => {
    if (settings.theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () =>
      document.documentElement.setAttribute('data-theme', resolveTheme('system'));
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  /** Update a single setting — applies live (theme takes effect immediately). */
  const update = useCallback((key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  /** Persist the current settings to localStorage. */
  const save = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, update, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
