'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { MERGE_TOKENS } from '@/lib/bot/mergeTokens';

/**
 * A template textarea with merge-token autocomplete. Typing "{" (or "{{name…")
 * opens a filtered menu of available variables; selecting inserts {{token}}.
 * A clickable legend below offers the same tokens for discoverability.
 */
export default function TemplateTextarea({ value, onChange, rows = 5, placeholder, className = '', tokens = MERGE_TOKENS }) {
  const ref = useRef(null);
  const [menu, setMenu] = useState(null); // { query, start } | null
  const [active, setActive] = useState(0);
  const caretRef = useRef(null);

  // Restore caret after a programmatic insert.
  useEffect(() => {
    if (caretRef.current != null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  const refresh = useCallback((el) => {
    const caret = el.selectionStart;
    const before = el.value.slice(0, caret);
    const m = before.match(/\{\{?\s*([a-zA-Z]*)$/); // an open brace (maybe doubled) + partial word
    if (m) { setMenu({ query: m[1].toLowerCase(), start: caret - m[0].length }); setActive(0); }
    else setMenu(null);
  }, []);

  function handleChange(e) { onChange(e.target.value); refresh(e.target); }

  function insertToken(token, start = null) {
    const el = ref.current;
    const caret = el ? el.selectionStart : value.length;
    const from = start != null ? start : caret;
    const next = value.slice(0, from) + `{{${token}}}` + value.slice(caret);
    caretRef.current = from + token.length + 4; // place caret after }}
    onChange(next);
    setMenu(null);
  }

  const filtered = menu ? tokens.filter(t => t.token.toLowerCase().includes(menu.query)) : [];

  function handleKeyDown(e) {
    if (!menu || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertToken(filtered[active].token, menu.start); }
    else if (e.key === 'Escape') { setMenu(null); }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={e => refresh(e.target)}
        onClick={e => refresh(e.target)}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        className={className}
      />
      {menu && filtered.length > 0 && (
        <div className="absolute z-50 left-2 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {filtered.map((t, i) => (
            <button key={t.token} type="button"
              onMouseDown={e => { e.preventDefault(); insertToken(t.token, menu.start); }}
              className={`w-full text-left px-3 py-1.5 ${i === active ? 'bg-amber-50' : ''} hover:bg-amber-50`}>
              <span className="font-mono text-xs text-amber-700">{`{{${t.token}}}`}</span>
              <span className="block text-[11px] text-slate-500">{t.label} · e.g. {t.sample}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-slate-400">Insert:</span>
        {tokens.map(t => (
          <button key={t.token} type="button" title={t.label}
            onClick={() => insertToken(t.token)}
            className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700 border border-slate-200">
            {`{{${t.token}}}`}
          </button>
        ))}
        <span className="text-[11px] text-slate-400">— or type <span className="font-mono">{'{'}</span></span>
      </div>
    </div>
  );
}
