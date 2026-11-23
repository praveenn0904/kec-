import { useEffect, useState } from 'react';
import { api } from './api.js';

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

let cachedMeta = null;
let pendingMeta = null;

/** Department list (and demo-account hint), fetched once and shared. Returns null until loaded. */
export function useMeta() {
  const [meta, setMeta] = useState(cachedMeta);
  useEffect(() => {
    if (cachedMeta) return;
    pendingMeta ||= api.meta();
    pendingMeta
      .then((m) => {
        cachedMeta = m;
        setMeta(m);
      })
      .catch(() => {
        pendingMeta = null;
      });
  }, []);
  return meta;
}
