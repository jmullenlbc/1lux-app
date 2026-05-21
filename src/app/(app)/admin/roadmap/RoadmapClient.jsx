'use client';
import { useState } from 'react';

export default function RoadmapClient() {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState('');
  const [sent,    setSent]    = useState(false);
  const [saving,  setSaving]  = useState(false);

  function handleSubmit() {
    if (!text.trim()) return;
    setSaving(true);
    // Placeholder — no backend wired up yet. Shows confirmation.
    setTimeout(() => {
      setSent(true);
      setSaving(false);
    }, 600);
  }

  function handleClose() {
    setOpen(false);
    setSent(false);
    setText('');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Request Feature
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => e.target === e.currentTarget && handleClose()}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Request a Feature</h2>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {sent ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-slate-700 font-medium">Request received!</p>
                <p className="text-sm text-slate-500 mt-1">We'll review it and add it to the roadmap if it fits.</p>
                <button onClick={handleClose} className="mt-5 px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors">
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4">
                  <p className="text-sm text-slate-500 mb-3">Describe the feature you'd like to see added to the platform.</p>
                  <textarea
                    autoFocus
                    rows={4}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="e.g. Allow exporting the fixture schedule as a PDF with ILC branding..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                  />
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving || !text.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Submitting…' : 'Submit request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
