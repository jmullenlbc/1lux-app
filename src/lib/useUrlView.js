'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Keeps a list's filters and sort in the page address (Mike 10-16: "a reload
// or a shared link keeps them"). Reads the address once on mount, writes it
// back with replaceState so the browser history does not fill up. Other
// address values (tab, as, id) are left alone.
//
//   fields: [{ key, kind }] where kind is text | pick | range | yesno | date
//   filters shape: { [key]: string | { min, max } }
//   sort shape:    { key, dir: 'asc' | 'desc' }
//
// Address form: key=value, key.min=1&key.max=9 for ranges, sort=key.desc.

const RANGE = (f) => f.kind === 'range';

export function readView(search, fields, sortDefault) {
  const p = new URLSearchParams(search || '');
  const filters = {};
  for (const f of fields) {
    if (RANGE(f)) {
      const min = p.get(`${f.key}.min`) ?? '';
      const max = p.get(`${f.key}.max`) ?? '';
      if (min !== '' || max !== '') filters[f.key] = { min, max };
    } else {
      const v = p.get(f.key);
      if (v !== null && v !== '') filters[f.key] = v;
    }
  }
  let sort = sortDefault;
  const s = p.get('sort');
  if (s) {
    const i = s.lastIndexOf('.');
    const key = i > 0 ? s.slice(0, i) : s;
    const dir = i > 0 && s.slice(i + 1) === 'desc' ? 'desc' : 'asc';
    if (fields.some(f => f.key === key) || !fields.length) sort = { key, dir };
  }
  return { filters, sort };
}

export function writeView(search, fields, filters, sort, sortDefault) {
  const p = new URLSearchParams(search || '');
  for (const f of fields) {
    p.delete(f.key); p.delete(`${f.key}.min`); p.delete(`${f.key}.max`);
    const v = filters?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (RANGE(f)) {
      if (v.min !== '' && v.min !== undefined && v.min !== null) p.set(`${f.key}.min`, String(v.min));
      if (v.max !== '' && v.max !== undefined && v.max !== null) p.set(`${f.key}.max`, String(v.max));
    } else {
      p.set(f.key, String(v));
    }
  }
  p.delete('sort');
  if (sort?.key && (sort.key !== sortDefault?.key || sort.dir !== sortDefault?.dir)) {
    p.set('sort', sort.dir === 'desc' ? `${sort.key}.desc` : sort.key);
  }
  const q = p.toString();
  return q ? `?${q}` : '';
}

export function useUrlView({ fields = [], sortDefault = { key: '', dir: 'asc' } } = {}) {
  const [filters, setFilters] = useState({});
  const [sort, setSortState] = useState(sortDefault);
  const [ready, setReady] = useState(false);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const defRef = useRef(sortDefault);
  const cur = useRef({ filters: {}, sort: sortDefault });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = readView(window.location.search, fieldsRef.current, defRef.current);
    cur.current = v;
    setFilters(v.filters);
    setSortState(v.sort);
    setReady(true);
  }, []);

  const commit = useCallback((nextFilters, nextSort) => {
    cur.current = { filters: nextFilters, sort: nextSort };
    setFilters(nextFilters);
    setSortState(nextSort);
    if (typeof window === 'undefined') return;
    const q = writeView(window.location.search, fieldsRef.current, nextFilters, nextSort, defRef.current);
    const url = `${window.location.pathname}${q}${window.location.hash || ''}`;
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const setFilter = useCallback((key, value) => {
    const next = { ...cur.current.filters };
    if (value === undefined || value === null || value === '') delete next[key];
    else next[key] = value;
    commit(next, cur.current.sort);
  }, [commit]);

  const replaceFilters = useCallback((next) => commit(next || {}, cur.current.sort), [commit]);
  const clearFilters = useCallback(() => commit({}, cur.current.sort), [commit]);

  const setSort = useCallback((next) => {
    const val = typeof next === 'function' ? next(cur.current.sort) : next;
    commit(cur.current.filters, val || defRef.current);
  }, [commit]);

  // Click a column header: same key flips the direction, a new key starts ascending.
  const toggleSort = useCallback((key) => {
    const prev = cur.current.sort;
    const val = prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
    commit(cur.current.filters, val);
  }, [commit]);

  return { filters, setFilter, replaceFilters, clearFilters, sort, setSort, toggleSort, ready };
}

export default useUrlView;
