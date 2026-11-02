'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import StatTile from '@/components/ui/StatTile';
import { CARD, HELPER, LABEL, STAT_VALUE } from '@/components/ui/tokens';

/**
 * A number box that saves itself half a second after the last change and on leaving the box.
 * If the save fails (onSave returns false) the box goes back to the saved number.
 */
export default function AutoNumber({ value, onSave, className, label, placeholder, step = 'any' }) {
  const shown = String(value ?? '');
  const [text, setText] = useState(shown);
  const last = useRef(shown);
  const server = useRef(shown);
  const focused = useRef(false);
  const timer = useRef(null);
  const pending = useRef(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    last.current = shown;
    server.current = shown;
    if (!focused.current) setText(shown);
  }, [shown]);

  const flush = async () => {
    clearTimeout(timer.current);
    const v = pending.current;
    pending.current = null;
    if (v === null || v === last.current) return;
    last.current = v;
    const ok = await saveRef.current(v);
    if (ok === false) {
      last.current = server.current;
      if (!focused.current) setText(server.current);
    }
  };
  useEffect(() => () => { flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input type="number" min="0" step={step} inputMode="decimal" className={className} aria-label={label} placeholder={placeholder} value={text}
      onFocus={e => { focused.current = true; e.target.select(); }}
      onChange={e => {
        setText(e.target.value);
        pending.current = e.target.value;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, 500);
      }}
      onBlur={() => { focused.current = false; flush(); }} />
  );
}

/** A top number. Reads like StatTile; a person who can edit it types straight into it. */
export function NumberTile({ label, value, shown, sub, tone, canEdit, onSave, placeholder }) {
  if (!canEdit) return <StatTile label={label} value={shown} sub={sub} tone={tone} />;
  return (
    <div className={`${CARD} p-4`}>
      <p className={LABEL}>{label}</p>
      <div className={cn(STAT_VALUE, 'mt-1 leading-tight flex items-baseline gap-0.5')}>
        <span>$</span>
        <AutoNumber value={value} onSave={onSave} label={label} placeholder={placeholder}
          className="w-full min-w-0 bg-transparent border-b border-dashed border-slate-300 focus:border-orange-500 outline-none tabular-nums placeholder:text-slate-300" />
      </div>
      {sub && <p className={cn(HELPER, 'mt-1')}>{sub}</p>}
    </div>
  );
}
