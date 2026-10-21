import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

// Loads a GET endpoint and re-fetches when the path changes.
// Ignores responses from stale requests.
export function useResource(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(path);
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) setError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load };
}

// Debounces a rapidly changing value such as a search box.
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
