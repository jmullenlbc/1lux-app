'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function SectionNav({ steps, currentStep, completedSteps, onJump, project, onSaveProjectMeta }) {
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({
    name:         project.name         || '',
    location:     project.location     || '',
    contactEmail: project.contactEmail || '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSaveProjectMeta(form);
    setSaving(false);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  }

  return (
    <aside className="w-56 bg-white border-r border-slate-100 flex flex-col shrink-0 overflow-y-auto">
      {/* Project name / editable header */}
      <div className="px-4 py-4 border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-2 transition-colors">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Projects
        </Link>

        {editing ? (
          <div className="space-y-2">
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="Project name"
              className="w-full text-sm font-semibold text-slate-900 border border-amber-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <input
              type="text"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="City, State"
              className="w-full text-xs text-slate-600 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <input
              type="email"
              value={form.contactEmail}
              onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="Contact email"
              className="w-full text-xs text-slate-600 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <div className="flex gap-1.5 pt-0.5">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setForm({ name: project.name || '', location: project.location || '', contactEmail: project.contactEmail || '' }); }}
                className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="group flex items-start gap-1">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 leading-snug truncate">{project.name}</div>
              {project.location && (
                <div className="text-xs text-slate-400 mt-0.5 truncate">{project.location}</div>
              )}
              {project.contactEmail && (
                <div className="text-xs text-slate-400 mt-0.5 truncate">{project.contactEmail}</div>
              )}
            </div>
            <button
              onClick={() => { setForm({ name: project.name || '', location: project.location || '', contactEmail: project.contactEmail || '' }); setEditing(true); }}
              className="shrink-0 p-1 rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors opacity-0 group-hover:opacity-100"
              title="Edit project details"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Steps */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {steps.map((step, i) => {
          const isActive    = step.id === currentStep;
          const isCompleted = completedSteps.includes(step.id);
          const isSummary   = step.id === 'summary';

          return (
            <button
              key={step.id}
              onClick={() => onJump(step.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors text-sm',
                isActive
                  ? 'bg-navy-800 text-white'
                  : isCompleted
                    ? 'text-slate-600 hover:bg-slate-50'
                    : isSummary
                      ? 'text-slate-400 hover:bg-slate-50'
                      : 'text-slate-400 hover:bg-slate-50',
              )}
            >
              {/* Step indicator */}
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
                isActive    ? 'bg-amber-500 text-white'
                : isCompleted ? 'bg-green-500 text-white'
                : 'bg-slate-100 text-slate-400',
              )}>
                {isCompleted && !isActive
                  ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  : <span>{i + 1}</span>
                }
              </div>
              <span className={cn('leading-tight', isActive && 'font-medium')}>
                {step.short}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
