'use client';
import { cn } from '@/lib/utils';

/**
 * Reusable radio-group question card used by all questionnaire sections.
 */
export default function QuestionCard({ question, note, options, value, onChange, highlight, costSuffix = '/unit' }) {
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
    </div>
  );
}
