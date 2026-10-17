'use client';

/**
 * The decorative option pool.
 *
 * Five fixtures a client actually picks, the kitchen pendant, the bath vanity,
 * the balcony sconce, the unit entry sconce and the ceiling fan. What is in here
 * is what anybody ever gets offered, so the screen is deliberately plain: one
 * category at a time, a card per fixture, and the two numbers that decide
 * whether a fixture survives a budget right on the front of the card.
 *
 * ── Two rules this screen exists to enforce ──────────────────────────────────
 * 1. Nothing is deleted. "Retire" switches a fixture off; every choice anybody
 *    ever made from it stays readable. Retired fixtures are hidden until you
 *    ask for them.
 * 2. The projection figure matters. On the unit entry sconce it is the number
 *    that decides whether a fixture is even legal on a job where the sconce
 *    mounts below 6'-8", so the form says so rather than leaving it a blank box.
 */
import { useEffect, useMemo, useState } from 'react';

const CATEGORY_TABS = [
  { key: 'p1',  label: 'Kitchen pendant',  hint: 'Over the island.' },
  { key: 'v1',  label: 'Bath vanity',      hint: 'Bath bars and illuminated mirrors. Damp rated.' },
  { key: 'ew1', label: 'Balcony sconce',   hint: 'Outdoors. Wet rated, always.' },
  { key: 'w1',  label: 'Unit entry sconce', hint: 'In the corridor. How far it sticks out decides whether it is legal.' },
  { key: 'f1',  label: 'Ceiling fan',      hint: 'With a light kit.' },
];

const FINISH_CHOICES = [
  { key: 'matte_black',    label: 'Matte black' },
  { key: 'brushed_nickel', label: 'Brushed nickel' },
  { key: 'aged_brass',     label: 'Aged brass' },
  { key: 'bronze',         label: 'Bronze' },
  { key: 'chrome',         label: 'Chrome' },
  { key: 'white',          label: 'White' },
];
const FINISH_LABEL = Object.fromEntries(FINISH_CHOICES.map(f => [f.key, f.label]));
const finishLabel = k => FINISH_LABEL[k] || k;

const SHAPES = ['round', 'linear', 'drum', 'lantern', 'globe', 'bar', 'mirror'];
const STYLES = ['modern', 'transitional', 'traditional', 'industrial', 'farmhouse'];

const money = n => (n === null || n === undefined || n === '' ? '—' : `$${Number(n).toLocaleString()}`);

/** Blank fields for a new fixture in the category you are looking at. */
const blankOption = category => ({
  category,
  name: '',
  shape: '',
  style: '',
  dimLabel: '',
  projectionIn: '',
  bladeSpanIn: '',
  wetRated: category === 'ew1',
  dampRated: category === 'v1',
  imageUrl: '',
  sortOrder: '',
  finishes: [{ finishKey: 'matte_black', cnPrice: '', dnPrice: '', catalogNumber: '', manufacturer: '', leadTimeWks: '', isDefault: true, isActive: true }],
});

export default function PoolAdmin({ canEdit = false }) {
  const [category, setCategory] = useState('p1');
  const [showRetired, setShowRetired] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // an option object, or blankOption()

  const tab = useMemo(() => CATEGORY_TABS.find(t => t.key === category), [category]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ category });
      if (showRetired) qs.set('includeRetired', '1');
      const res = await fetch(`/api/admin/decorative-options?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'That list would not load.');
      setOptions(data.options || []);
    } catch (e) {
      setError(e.message);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [category, showRetired]);

  async function retire(option, isActive) {
    const res = await fetch(`/api/admin/decorative-options/${option.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) load();
    else setError((await res.json().catch(() => ({})))?.error || 'That did not save.');
  }

  const live = options.filter(o => o.isActive);
  const retired = options.filter(o => !o.isActive);

  return (
    <div className="pb-28">
      {/* ── Which fixture ── */}
      <div className="flex flex-wrap gap-2 mb-1">
        {CATEGORY_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setCategory(t.key); setEditing(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              category === t.key
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500 mb-5">{tab?.hint}</p>

      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={e => setShowRetired(e.target.checked)}
            className="rounded border-slate-300 text-amber-500 focus:ring-orange-500"
          />
          Show retired fixtures
        </label>
        {canEdit && (
          <button
            onClick={() => setEditing(blankOption(category))}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
          >
            Add a fixture
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 py-8">Loading&hellip;</p>
      ) : !options.length ? (
        <div className="py-12 text-center">
          <p className="text-slate-500">Nothing in this pool yet.</p>
          {canEdit && <p className="text-sm text-slate-400 mt-1">Add a fixture, or run the starter pool seed.</p>}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map(o => (
              <OptionCard key={o.id} option={o} canEdit={canEdit} onEdit={() => setEditing(o)} onRetire={() => retire(o, false)} />
            ))}
          </div>

          {showRetired && retired.length > 0 && (
            <>
              <h3 className="mt-10 mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Retired &mdash; not offered on new surveys
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {retired.map(o => (
                  <OptionCard
                    key={o.id}
                    option={o}
                    canEdit={canEdit}
                    retiredLook
                    onEdit={() => setEditing(o)}
                    onRestore={() => retire(o, true)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <OptionEditor
          option={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

/** One fixture, as a card. The price range is the whole point of the front. */
function OptionCard({ option, canEdit, retiredLook, onEdit, onRetire, onRestore }) {
  const liveFinishes = option.finishes.filter(f => f.isActive);
  const prices = liveFinishes.map(f => f.cnPrice).filter(p => p !== null && p !== undefined);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${retiredLook ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      <div className="h-36 bg-slate-50 flex items-center justify-center">
        {option.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.imageUrl} alt={option.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-300">No picture</span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-slate-900 text-sm leading-snug">{option.name}</h4>
          {prices.length > 0 && (
            <span className="shrink-0 text-sm font-semibold text-slate-900">
              {low === high ? money(low) : `${money(low)} to ${money(high)}`}
            </span>
          )}
        </div>

        {option.dimLabel && <p className="text-xs text-slate-500 mt-1">{option.dimLabel}</p>}

        <div className="flex flex-wrap gap-1.5 mt-3">
          {option.shape && <Pill>{option.shape}</Pill>}
          {option.style && <Pill>{option.style}</Pill>}
          {option.wetRated && <Pill tone="sky">Wet rated</Pill>}
          {!option.wetRated && option.dampRated && <Pill tone="sky">Damp rated</Pill>}
          {option.projectionIn != null && (
            <Pill tone={option.projectionIn > 4 ? 'amber' : 'slate'}>
              {option.projectionIn}in out
            </Pill>
          )}
          {option.bladeSpanIn != null && <Pill>{option.bladeSpanIn}in span</Pill>}
        </div>

        <p className="text-xs text-slate-400 mt-3">
          {liveFinishes.length
            ? liveFinishes.map(f => finishLabel(f.finishKey)).join(', ')
            : 'No finishes on record, this one can never be offered.'}
        </p>

        {canEdit && (
          <div className="flex gap-2 mt-4">
            <button onClick={onEdit} className="text-xs font-semibold text-slate-600 hover:text-slate-900">Edit</button>
            <span className="text-slate-200">|</span>
            {retiredLook ? (
              <button onClick={onRestore} className="text-xs font-semibold text-orange-600 hover:text-orange-700">Bring back</button>
            ) : (
              <button onClick={onRetire} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Retire</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

/** Add or change one fixture, finishes and all. */
function OptionEditor({ option, onClose, onSaved }) {
  const isNew = !option.id;
  const [form, setForm] = useState(() => ({
    ...option,
    projectionIn: option.projectionIn ?? '',
    bladeSpanIn: option.bladeSpanIn ?? '',
    sortOrder: option.sortOrder ?? '',
    imageUrl: option.imageUrl ?? '',
    finishes: (option.finishes || []).map(f => ({
      finishKey: f.finishKey,
      catalogNumber: f.catalogNumber ?? '',
      manufacturer: f.manufacturer ?? '',
      dnPrice: f.dnPrice ?? '',
      cnPrice: f.cnPrice ?? '',
      leadTimeWks: f.leadTimeWks ?? '',
      isDefault: !!f.isDefault,
      isActive: f.isActive !== false,
    })),
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFinish = (i, k, v) =>
    setForm(f => ({ ...f, finishes: f.finishes.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  const isEntrySconce = form.category === 'w1';
  const isFan = form.category === 'f1';

  async function uploadImage(file) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/admin/decorative-options/image', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'That picture would not upload.');
      set('imageUrl', data.imageUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      // Only finishes somebody actually filled in. A blank row is somebody who
      // opened a row and changed their mind, not a finish with no price.
      const finishes = form.finishes.filter(f => f.finishKey);
      const payload = {
        category: form.category,
        name: form.name,
        shape: form.shape,
        style: form.style,
        dimLabel: form.dimLabel,
        projectionIn: form.projectionIn,
        bladeSpanIn: form.bladeSpanIn,
        wetRated: form.wetRated,
        dampRated: form.dampRated,
        imageUrl: form.imageUrl || null,
        sortOrder: form.sortOrder,
        finishes,
      };
      const res = await fetch(
        isNew ? '/api/admin/decorative-options' : `/api/admin/decorative-options/${option.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'That did not save.');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{isNew ? 'Add a fixture' : form.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <Field label="What it is called">
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Small round glass pendant"
              className={inputCls}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Shape">
              <select value={form.shape} onChange={e => set('shape', e.target.value)} className={inputCls}>
                <option value="">—</option>
                {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                {/* A shape somebody typed before this list existed keeps working. */}
                {form.shape && !SHAPES.includes(form.shape) && <option value={form.shape}>{form.shape}</option>}
              </select>
            </Field>
            <Field label="Style">
              <select value={form.style} onChange={e => set('style', e.target.value)} className={inputCls}>
                <option value="">—</option>
                {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                {form.style && !STYLES.includes(form.style) && <option value={form.style}>{form.style}</option>}
              </select>
            </Field>
          </div>

          <Field label="Size, in words" hint="Shown to people, never read by the app.">
            <input
              value={form.dimLabel}
              onChange={e => set('dimLabel', e.target.value)}
              placeholder="7in dia x 12in H"
              className={inputCls}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="How far it sticks out, in inches"
              hint={isEntrySconce
                ? 'This decides whether it is legal. Anything over 4in is taken away on a job where the sconce mounts at or below 6′-8″.'
                : 'Optional.'}
            >
              <input
                value={form.projectionIn}
                onChange={e => set('projectionIn', e.target.value)}
                inputMode="decimal"
                placeholder="4"
                className={inputCls}
              />
            </Field>
            {isFan && (
              <Field label="Blade span, in inches">
                <input
                  value={form.bladeSpanIn}
                  onChange={e => set('bladeSpanIn', e.target.value)}
                  inputMode="decimal"
                  placeholder="52"
                  className={inputCls}
                />
              </Field>
            )}
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!form.wetRated}
                onChange={e => set('wetRated', e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-orange-500"
              />
              Wet rated
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!form.dampRated}
                onChange={e => set('dampRated', e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-orange-500"
              />
              Damp rated
            </label>
            <div className="text-xs text-slate-400 self-center">
              A balcony needs wet. A bathroom needs damp, and a wet fixture is fine there too.
            </div>
          </div>

          <Field label="Picture">
            <div className="flex items-center gap-4">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="h-20 w-20 object-contain rounded-lg bg-slate-50" />
              )}
              <div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => uploadImage(e.target.files?.[0])}
                  className="text-sm text-slate-600"
                />
                {uploading && <p className="text-xs text-slate-400 mt-1">Uploading&hellip;</p>}
                {form.imageUrl && !uploading && (
                  <button
                    onClick={() => set('imageUrl', '')}
                    className="text-xs text-slate-400 hover:text-slate-600 mt-1 block"
                  >
                    Remove the picture
                  </button>
                )}
              </div>
            </div>
          </Field>

          {/* ── Finishes ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Finishes</span>
              <button
                onClick={() => setForm(f => ({
                  ...f,
                  finishes: [...f.finishes, { finishKey: '', catalogNumber: '', manufacturer: '', dnPrice: '', cnPrice: '', leadTimeWks: '', isDefault: false, isActive: true }],
                }))}
                className="text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                Add a finish
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              The sell price is what a budget is measured against. The buy price is ours and never
              leaves the building. Taking a finish off the list switches it off; it is never deleted.
            </p>

            <div className="space-y-3">
              {form.finishes.map((f, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <select value={f.finishKey} onChange={e => setFinish(i, 'finishKey', e.target.value)} className={inputCls}>
                      <option value="">Pick a finish</option>
                      {FINISH_CHOICES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      {f.finishKey && !FINISH_LABEL[f.finishKey] && <option value={f.finishKey}>{f.finishKey}</option>}
                    </select>
                    <input
                      value={f.cnPrice}
                      onChange={e => setFinish(i, 'cnPrice', e.target.value)}
                      inputMode="decimal"
                      placeholder="Sell price"
                      className={inputCls}
                    />
                    <input
                      value={f.dnPrice}
                      onChange={e => setFinish(i, 'dnPrice', e.target.value)}
                      inputMode="decimal"
                      placeholder="Buy price (internal)"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mt-3">
                    <input
                      value={f.manufacturer}
                      onChange={e => setFinish(i, 'manufacturer', e.target.value)}
                      placeholder="Manufacturer"
                      className={inputCls}
                    />
                    <input
                      value={f.catalogNumber}
                      onChange={e => setFinish(i, 'catalogNumber', e.target.value)}
                      placeholder="Catalog number"
                      className={inputCls}
                    />
                    <input
                      value={f.leadTimeWks}
                      onChange={e => setFinish(i, 'leadTimeWks', e.target.value)}
                      inputMode="numeric"
                      placeholder="Lead time, weeks"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="radio"
                        name="defaultFinish"
                        checked={!!f.isDefault}
                        onChange={() => setForm(fm => ({
                          ...fm,
                          finishes: fm.finishes.map((x, j) => ({ ...x, isDefault: j === i })),
                        }))}
                        className="text-amber-500 focus:ring-orange-500"
                      />
                      Show this one first
                    </label>
                    <button
                      onClick={() => setForm(fm => ({ ...fm, finishes: fm.finishes.filter((_, j) => j !== i) }))}
                      className="text-xs text-slate-400 hover:text-slate-600 ml-auto"
                    >
                      Take it off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || uploading || !form.name.trim()}
            className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? 'Add it' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent';

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
