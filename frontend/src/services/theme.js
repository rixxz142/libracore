import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Theme preference: 'system' follows the OS; 'light'/'dark' are explicit.
// The choice is a per-browser convenience, so localStorage is fine here.
const STORAGE_KEY = 'libracore-theme';
const ThemeContext = createContext(null);

function readPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }, [preference]);

  const setPreference = useCallback((value) => {
    setPreferenceState(value);
    try {
      if (value === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage unavailable (private window); the choice lasts for this visit.
    }
  }, []);

  const resolved = preference === 'system' ? system : preference;
  const toggle = useCallback(() => setPreference(resolved === 'dark' ? 'light' : 'dark'), [resolved, setPreference]);

  const value = useMemo(() => ({ preference, resolved, setPreference, toggle }), [preference, resolved, setPreference, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
