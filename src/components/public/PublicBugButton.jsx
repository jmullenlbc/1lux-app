'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * "Report a bug" for beta-test clients on the public /conceptual_budget pages.
 *
 * Public page, so: no session reads, no screenshot or console capture (that is
 * the staff QcCapture's job) — only what the visitor types, plus the page URL
 * and browser so we can reproduce it. Messages are inline, not toasts: there is
 * no <Toaster /> on the public side.
 *
 * Sits bottom-right at z-40 — above the wizard, below any z-50 modal. The
 * wizard's Back / Next row is in the normal page flow (not fixed) with the
 * footer note below it, so it scrolls clear of this button.
 */

const inputCls = 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400';
const labelCls = 'text-xs font-semibold text-slate-600';

export default function PublicBugButton() {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState('');
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const buttonRef = useRef(null);
  const textRef   = useRef(null);

  // Escape closes the panel and hands focus back to the button.
  useEffect(() => {
    if (!open) return;
    textRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function openPanel() {
    // A fresh report after a sent one; name and email are kept so they don't retype.
    if (sent) { setSent(false); setText(''); }
    setError('');
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) { setError('Please tell us what went wrong first.'); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/intake/bug-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: text,
          name,
          email,
          pageUrl:   window.location.href,
          userAgent: navigator.userAgent,
          viewport:  `${window.innerWidth} x ${window.innerHeight}`,
        }),
      });
      // Amplify's front door can answer with an empty body, so never assume JSON.
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "We couldn't send that just now. Please try again in a minute.");
        return;
      }
      setSent(true);
    } catch {
      setError("We couldn't reach our server. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="print:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label="Report a bug"
        aria-expanded={open}
        aria-controls="public-bug-panel"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold shadow-lg transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="8" y="6" width="8" height="14" rx="4" />
          <path d="M12 6V3M5 9l3 1M19 9l-3 1M4 14h4M16 14h4M6 19l2-1M18 19l-2-1" />
        </svg>
        Report a bug
      </button>

      {open && (
        <div
          id="public-bug-panel"
          role="dialog"
          aria-labelledby="public-bug-title"
          className="fixed bottom-16 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm max-h-[calc(100vh-6rem)] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <h2 id="public-bug-title" className="text-sm font-semibold text-slate-800">Report a bug</h2>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600 text-xl leading-none -mt-1"
            >
              &times;
            </button>
          </div>

          {sent ? (
            <div>
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5" role="status">
                Thanks — we got it. Our team will take a look.
              </p>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={closePanel}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={send} noValidate>
              <label className="block">
                <span className={labelCls}>What went wrong?</span>
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  maxLength={4000}
                  rows={4}
                  placeholder="Tell us what you were doing and what happened."
                  className={inputCls}
                />
              </label>

              <p className="text-xs text-slate-500 mt-3">Your name and email, so we can follow up — optional</p>
              <label className="block mt-1">
                <span className="sr-only">Your name (optional)</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={200}
                  autoComplete="name"
                  placeholder="Name"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="sr-only">Your email (optional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={200}
                  autoComplete="email"
                  placeholder="Email"
                  className={inputCls}
                />
              </label>

              {error && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={closePanel}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
