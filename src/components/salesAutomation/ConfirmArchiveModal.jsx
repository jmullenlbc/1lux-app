'use client';
import { useEffect } from 'react';

// ── Archive confirmation ─────────────────────────────────────────────────────
// The amber "are you sure?" for anything that is archived instead of deleted:
// the bot's library (Mike, 2026-09-10: "we still have a pop up that says
// something to the effect of by archiving this item the bot will not be able to
// reach it") and email templates (2026-09-11).
//
// Archiving is the strongest thing these screens can do, and it is still worth
// asking about: an archived item is invisible to the bot from that moment on,
// and nobody reading the bot's work later would guess why. Everything is kept,
// so this is a question, not a warning. The caller supplies the words.
// The words every "archive a document" confirm uses (files, drawing sets,
// budget versions, products - migration 0076).
export const KEPT_ON_ARCHIVE_PAGE =
  'Nothing is deleted. It moves to the Archive page, where anyone can restore it exactly as it was.';

// The archive-box outline used on every Archive button (in place of the old
// red trash can).
export function ArchiveBoxIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

// POST { archived } to a record's own route. Resolves to '' on success or to
// the words to show when it did not work, so the caller only takes a row off
// the screen once the server has really archived it.
export async function setArchived(url, archived = true) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    if (res.ok) return '';
    const data = await res.json().catch(() => ({}));
    return data.error || 'Could not archive it. Nothing was changed.';
  } catch {
    return 'Could not reach the server. Nothing was changed.';
  }
}

export default function ConfirmArchiveModal({
  open, title, what, body, busy, onCancel, onConfirm, confirmLabel = 'Archive it',
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              {what && (
                <p className="text-sm text-slate-600 mt-1 break-words line-clamp-4">“{what}”</p>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-sm text-amber-800 leading-relaxed">
            {body}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-w-[8rem] px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Keep it as is
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 min-w-[8rem] px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-60"
          >
            {busy ? 'Archiving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
