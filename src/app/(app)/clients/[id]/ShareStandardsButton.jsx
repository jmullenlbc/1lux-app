'use client';
import { useState } from 'react';
import { CARD, BTN_PRIMARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, LABEL, HELPER } from '@/components/ui/tokens';

// Generates / reveals the persistent, live-updating public share link for this
// client's lighting standards. The linked page always reflects current selections.
export default function ShareStandardsButton({ clientId }) {
  const [open, setOpen]       = useState(false);
  const [url, setUrl]         = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');

  async function openPanel() {
    setOpen(true);
    if (url || loading) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/clients/${clientId}/standards/share`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create link');
      setUrl(data.shareUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — user can select manually */ }
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={openPanel}
        className={`${BTN_PRIMARY} w-full`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share standards
      </button>

      {open && (
        <div className={`${CARD} mt-2 p-3`}>
          {loading && <p className={HELPER}>Generating link...</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {url && (
            <>
              <p className={`${LABEL} mb-1.5`}>Live share link</p>
              <input
                readOnly
                value={url}
                onFocus={e => e.target.select()}
                className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 mb-2"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className={`${BTN_COMPACT_PRIMARY} flex-1`}
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${BTN_COMPACT} flex-1`}
                >
                  Open / PDF
                </a>
              </div>
              <p className={`${HELPER} mt-2`}>
                Updates automatically as standards change. Open the link and use “Download PDF” to save a copy.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
