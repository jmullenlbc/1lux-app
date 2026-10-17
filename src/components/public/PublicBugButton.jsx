'use client';
import { useEffect, useRef, useState } from 'react';
import { parseBrowserInfo } from '@/lib/browserInfo';
import { BTN_GHOST, BTN_PRIMARY, INPUT, LABEL, MODAL } from '@/components/ui/tokens';
import { OPEN_PUBLIC_BUG, openHelper, useHelperEvent } from '@/components/layout/helperEvents';

/**
 * "Report a bug" for beta-test clients on the public /conceptual_budget pages.
 *
 * Mike 10-15: the same capture as the staff QcCapture, minus the module
 * dropdown (we know it is the budget tool): an automatic screenshot of the
 * page when the panel opens (shown as a preview), the page link, the browser
 * and the window size, plus what the visitor types. No session reads and no
 * console log (that recorder only runs inside the app). Messages are inline,
 * not toasts: there is no <Toaster /> on the public side.
 *
 * No floating button (Mike 10-17: it covered the rail text). Pages place a
 * <PublicBugLink /> in their own frame and this panel opens as a centered
 * dialog. The wizard also hands over the budget draft and step
 * (window.__ilcIntake) so the report links straight to the budget.
 */

/** The "Report a bug" trigger a public page places in its rail or header. */
export function PublicBugLink({ className = '' }) {
  return (
    <button
      type="button"
      onClick={() => openHelper(OPEN_PUBLIC_BUG)}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 print:hidden ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="8" y="6" width="8" height="14" rx="4" />
        <path d="M12 6V3M5 9l3 1M19 9l-3 1M4 14h4M16 14h4M6 19l2-1M18 19l-2-1" />
      </svg>
      Report a bug
    </button>
  );
}

const inputCls = `${INPUT} mt-1`;
const labelCls = LABEL;

// Amplify's front door answers an empty 413 over ~4.4 MB, so a screenshot
// bigger than this is dropped rather than sinking the whole report.
const MAX_SHOT_BYTES = 3_500_000;

export default function PublicBugButton() {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState('');
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [shot,    setShot]    = useState(null); // { blob, url } or null
  const [shotOn,  setShotOn]  = useState(true);
  const [pageUrl, setPageUrl] = useState('');
  const returnRef = useRef(null);
  const textRef   = useRef(null);

  useHelperEvent(OPEN_PUBLIC_BUG, () => { if (!open) openPanel(); });

  // Grab the page as a JPEG while the panel is still closed, so the
  // screenshot shows what the visitor saw, not our own form on top of it.
  async function capture() {
    try {
      const { toCanvas } = await import('html-to-image');
      const canvas = await toCanvas(document.body, { cacheBust: true, pixelRatio: 1 });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
      if (!blob || blob.size > MAX_SHOT_BYTES) { setShot(null); return; }
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setShot(null);
    }
  }

  // Escape closes the panel and hands focus back to the button.
  useEffect(() => {
    if (!open) return;
    textRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') closePanel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function openPanel() {
    // Focus goes back to whichever "Report a bug" link was pressed.
    returnRef.current = document.activeElement;
    // A fresh report after a sent one; name and email are kept so they don't retype.
    if (sent) { setSent(false); setText(''); }
    setError('');
    setShotOn(true);
    setPageUrl(window.location.href);
    await capture();
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    returnRef.current?.focus?.();
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) { setError('Please tell us what went wrong first.'); return; }
    setSending(true);
    setError('');
    try {
      // Same shape as the staff report: a `meta` JSON part plus the screenshot.
      // The wizard's budget draft and step, so the report opens that budget.
      const intake = window.__ilcIntake || {};
      const fd = new FormData();
      if (shotOn && shot?.blob) fd.append('screenshot', shot.blob, 'screenshot.jpg');
      fd.append('meta', JSON.stringify({
        description: text,
        name,
        email,
        pageUrl,
        draftId:     intake.draftId || '',
        step:        intake.stepLabel || '',
        projectName: intake.projectName || '',
        userAgent: `${parseBrowserInfo()} · ${navigator.userAgent}`,
        viewport:  `${window.innerWidth} x ${window.innerHeight}`,
      }));
      const res = await fetch('/api/intake/bug-report', { method: 'POST', body: fd });
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

  if (!open) return null;
  return (
    <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) closePanel(); }}>
      {(
        <div
          id="public-bug-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-bug-title"
          className={`w-full max-w-md max-h-[90vh] overflow-y-auto ${MODAL} p-5`}
        >
          <div className="flex items-start justify-between mb-3">
            <h2 id="public-bug-title" className="text-sm font-semibold text-slate-800">Report a bug</h2>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              className="text-slate-500 hover:text-slate-700 text-xl leading-none -mt-1"
            >
              &times;
            </button>
          </div>

          {sent ? (
            <div>
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5" role="status">
                Thanks, we got it. Our team will take a look.
              </p>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={closePanel}
                  className={BTN_PRIMARY}
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

              {shot?.url && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={shotOn} onChange={e => setShotOn(e.target.checked)} className="accent-orange-500" />
                    Include a screenshot of this page
                  </label>
                  {shotOn && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shot.url} alt="Screenshot of this page" className="mt-1.5 w-full rounded-lg border border-slate-200" />
                  )}
                </div>
              )}
              {pageUrl && (
                <div className="mt-3">
                  <span className={labelCls}>Page link</span>
                  <p className="mt-1 text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">{pageUrl}</p>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2">We also note your browser and window size so we can reproduce it.</p>

              <p className="text-xs text-slate-500 mt-3">Your name and email, so we can follow up, optional</p>
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
                  className={BTN_GHOST}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className={BTN_PRIMARY}
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
