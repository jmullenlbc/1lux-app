'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function GlobalAIButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Project pages render ProjectChat directly — don't show here
  if (/^\/project\/[^/]+(\/|$)/.test(pathname)) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow-xl transition-all hover:scale-105 print:hidden"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-sm font-semibold">Ask AI</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" style={{ height: '320px' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">ILC AI Assistant</div>
              <div className="text-[11px] text-slate-400 leading-tight">Powered by Claude</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white shrink-0 ml-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Coming soon body */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-semibold text-slate-800 mb-1">Coming to the entire platform</div>
              <div className="text-sm text-slate-500 leading-relaxed">AI assistance is currently available inside projects. Platform-wide AI is on the way.</div>
            </div>
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
              Open any project to chat with AI about fixtures, budgets, and more.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
