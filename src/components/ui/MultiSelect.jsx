'use client';

/**
 * Multi-select chips. One shared control so the Client Type, Developer Type and
 * Project Type pickers look and behave identically on the new-client page, the
 * clients list modal and the client detail editor.
 *
 * `options` takes either plain strings or { value, label } objects; `selected`
 * is always an array of the stored values.
 */
export default function MultiSelect({ options, selected = [], onChange, label, hint, className = '' }) {
  const list = Array.isArray(selected) ? selected : [];

  return (
    <div className={className}>
      {label && (
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const val    = typeof o === 'string' ? o : o.value;
          const lbl    = typeof o === 'string' ? o : o.label;
          const active = list.includes(val);
          return (
            <button
              key={val}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? list.filter(s => s !== val) : [...list, val])}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}
