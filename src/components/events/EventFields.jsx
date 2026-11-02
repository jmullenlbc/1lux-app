'use client';
import { useState } from 'react';
import AutoNumber from '@/components/ui/AutoNumber';
import { HELPER, INPUT, LABEL, SELECT } from '@/components/ui/tokens';
import { VERTICALS, FOCUS_TAGS, FORMATS, ACCESS_ROUTES } from '@/lib/conferences/constants';
import { money } from '@/components/events/eventsShared';

const ADD = '__add__';

// Our options, then anything already typed on another event, as [key, label].
function optionsFrom(list, used = []) {
  const known = new Set(list.map(x => x.key));
  return [...list.map(x => [x.key, x.label]), ...used.filter(v => !known.has(v)).map(v => [v, v])];
}

/** A dropdown of the options with Add new at the bottom, which swaps to a text box. */
function PickOrNew({ label, value, options, onSave, blank, clearable }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  function done() {
    const v = text.trim();
    setAdding(false);
    setText('');
    if (v) onSave(v);
  }

  if (adding) {
    return (
      <label className="block"><span className={LABEL}>{label}</span>
        <input autoFocus className={INPUT} maxLength={60} value={text} placeholder="Type the new one" onChange={e => setText(e.target.value)} onBlur={done}
          onKeyDown={e => {
            if (e.key === 'Enter') e.target.blur();
            if (e.key === 'Escape') { setText(''); setAdding(false); }
          }} />
      </label>
    );
  }
  return (
    <label className="block"><span className={LABEL}>{label}</span>
      <select className={SELECT} value={value || ''} onChange={e => {
        if (e.target.value === ADD) setAdding(true);
        else if (e.target.value || clearable) onSave(e.target.value);
      }}>
        {blank && <option value="">{blank}</option>}
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        <option value={ADD}>Add new</option>
      </select>
    </label>
  );
}

function FocusChips({ e, options, onSave }) {
  return (
    <div className="sm:col-span-2">
      <span className={LABEL}>Focus</span>
      {e.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
          {e.tags.map((t, i) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-xs px-2 py-0.5">
              {e.tagLabels[i] || t}
              <button type="button" aria-label={`Remove ${e.tagLabels[i] || t}`} className="text-slate-400 hover:text-red-600"
                onClick={() => onSave({ tags: e.tags.filter(x => x !== t) })}>×</button>
            </span>
          ))}
        </div>
      )}
      <PickOrNew label="Add a focus" options={options.filter(([k]) => !e.tags.includes(k))} blank="Pick one" onSave={v => onSave({ tags: [...e.tags, v] })} />
    </div>
  );
}

/** Vertical, Focus, Format and Access are the conference's. Registration is this year's. */
export default function EventFields({ e, onSave }) {
  const used = e.options || {};
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PickOrNew label="Vertical" value={e.vertical} options={optionsFrom(VERTICALS, used.vertical)} onSave={v => onSave({ vertical: v })} />
        <PickOrNew label="Format" value={e.formatKey} options={optionsFrom(FORMATS, used.format)} blank="Not set" clearable onSave={v => onSave({ format: v })} />
        <PickOrNew label="Access" value={e.accessRoute} options={optionsFrom(ACCESS_ROUTES, used.access)} onSave={v => onSave({ accessRoute: v })} />
        <label className="block"><span className={LABEL}>Registration</span>
          <AutoNumber className={INPUT} value={e.reg} label="Registration" placeholder={money(e.reg)} onSave={v => onSave({ regCost: v })} />
        </label>
        <FocusChips e={e} options={optionsFrom(FOCUS_TAGS, used.focus)} onSave={onSave} />
      </div>
      <p className={HELPER}>Vertical, Focus, Format and Access apply to every year of this conference. A number typed in Registration replaces the researched price.</p>
    </div>
  );
}
