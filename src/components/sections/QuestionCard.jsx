'use client';
import { cn } from '@/lib/utils';

/**
 * Reusable radio-group question card used by all questionnaire sections.
 */
/**
 * Optional per-project price override.
 *
 * Pass `override` to put a small price box at the foot of the card. Leave it out
 * and the card behaves exactly as before.
 *
 *   override = {
 *     value,          // current stored value ('' / 'auto' / a number as a string)
 *     onChange,       // (nextValue) => void — receives 'auto' when cleared
 *     masterPrice,    // the master-pricing number this replaces, for the "was" text
 *     suffix,         // '/unit', '/vanity', '/fan', '/balcony'
 *     disabled,       // true when the answer is "None" — nothing to price
 *   }
 *
 * The box writes 'auto' rather than '' when emptied. The responses store refuses
 * to overwrite a real value with a blank one, so a cleared field sending '' would
 * be silently ignored and the old override would stick forever.
 */
function OverrideBox({ value, onChange, masterPrice, suffix = '/unit', disabled }) {
  const active = value != null && String(value).trim() !== '' && String(value).trim().toLowerCase() !== 'auto';

  if (disabled) {
    return (
      <div className="mt-4 pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-300">Price override available once an option other than “None” is selected.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs font-medium text-slate-500 shrink-0">Override price</label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">$</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={active ? value : ''}
            placeholder={masterPrice != null ? String(masterPrice) : ''}
            onChange={e => onChange(e.target.value === '' ? 'auto' : e.target.value)}
            className={cn(
              'w-28 rounded-md border pl-5 pr-2 py-1 text-sm font-mono transition-colors',
              active
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-slate-200 text-slate-700 focus:border-slate-300',
            )}
          />
        </div>
        <span className="text-xs text-slate-400 shrink-0">{suffix}</span>
        {active && (
          <>
            <span className="text-xs text-amber-600 font-medium">
              Using your price{masterPrice != null ? ` instead of $${Number(masterPrice).toLocaleString()}` : ''}
            </span>
            <button
              type="button"
              onClick={() => onChange('auto')}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              reset
            </button>
          </>
        )}
      </div>
      {!active && (
        <p className="text-[11px] text-slate-400 mt-1.5">
          Leave blank to use the master price sheet. A number here is used exactly as typed — no credits or adjustments are applied on top of it.
        </p>
      )}
    </div>
  );
}

const money = v => `$${Math.round(Number(v) || 0).toLocaleString()}`;
const moneyEach = v => {
  const x = Number(v) || 0;
  return `$${x.toLocaleString(undefined, { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/**
 * What the chosen answer costs, printed right under it (Mike 2026-09-13: "show
 * the cost impact of that exact question next to the answer"). `impact` is one
 * entry of budget.questionCosts: { lines:[{label,count,countLabel,each,product,
 * laborEach,labor}], product, labor }. Labor is an estimate, never in a total.
 */
export function CostImpact({ impact }) {
  if (!impact || !impact.lines?.length || !(impact.product > 0 || impact.labor > 0)) return null;
  return (
    <div className="mt-2 rounded-md bg-white/70 border border-amber-200 px-3 py-2 text-xs text-slate-600 space-y-0.5">
      {impact.lines.map((l, i) => (
        <div key={i}>
          {/* The public page sends dollars plus a rounded count in words
              ("approx. 47 area lights") — no price each and no rule (Mike
              2026-09-16 / 09-18). Staff screens send the real count and price
              and get the full "200 × $175 =" working. */}
          {l.product === 0 && l.labor < 0 ? <span>{l.label}</span> : (l.count != null && l.each != null)
            ? <span>{l.label}: {Number(l.count).toLocaleString()} {l.countLabel} × {moneyEach(l.each)} = <span className="font-mono font-semibold text-slate-800">{money(l.product)}</span></span>
            : <span>{l.label}{l.approx ? ` (${l.approx})` : ''}: <span className="font-mono font-semibold text-slate-800">{money(l.product)}</span></span>}
          {l.labor > 0 && (
            <div className="text-slate-500">
              Estimated labor: {l.count != null && l.laborEach != null && <>{Number(l.count).toLocaleString()} × {moneyEach(l.laborEach)} = </>}<span className="font-mono">{money(l.labor)}</span>
            </div>
          )}
          {l.labor < 0 && (
            <div className="text-emerald-700">
              Estimated labor saved: {l.count != null && l.laborEach != null && <>{Number(l.count).toLocaleString()} × {moneyEach(-l.laborEach)} = </>}<span className="font-mono">−{money(-l.labor)}</span>
            </div>
          )}
        </div>
      ))}
      {impact.labor > 0 && (
        <div className="pt-1 mt-1 border-t border-amber-100 font-medium text-slate-800">
          Estimated labor + materials: <span className="font-mono">{money(impact.product + impact.labor)}</span>
        </div>
      )}
    </div>
  );
}

export default function QuestionCard({ question, note, options, value, onChange, highlight, costSuffix = '/unit', override, impact }) {
  return (
    <div className={cn(
      'bg-white rounded-xl border p-5 transition-all',
      highlight ? 'border-amber-300 shadow-amber-100 shadow-md' : 'border-slate-200 shadow-sm',
    )}>
      <div className="mb-4">
        <p className="font-semibold text-slate-900">{question}</p>
        {note && (
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{note}</p>
        )}
      </div>

      <div className="space-y-2">
        {options.map(opt => (
          <label
            key={opt.value}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors',
              value === opt.value
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <input
              type="radio"
              name={question}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 accent-amber-500 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">{opt.label}</div>
              {opt.sub && (
                <div className="text-xs text-slate-400 mt-0.5">{opt.sub}</div>
              )}
              {value === opt.value && <CostImpact impact={impact} />}
            </div>
            {opt.cost != null && (
              <div className={cn(
                'text-xs font-mono font-semibold shrink-0 mt-0.5',
                opt.cost === 0 ? 'text-slate-300' : 'text-amber-600',
              )}>
                {opt.cost === 0 ? 'Included' : `+$${opt.cost.toLocaleString()}${costSuffix}`}
              </div>
            )}
          </label>
        ))}
      </div>

      {override && <OverrideBox {...override} suffix={override.suffix ?? costSuffix} />}
    </div>
  );
}
