'use client';
import { useState } from 'react';
import { formatCurrency } from '@/lib/calculations';

export default function SendBudgetModal({ projectId, projectName, totalBudget, onClose }) {
  const [emails, setEmails]     = useState(['']);
  const [message, setMessage]   = useState('');
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState(null); // { shareUrl, share }
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState(false);

  const [pastShares, setPastShares]       = useState(null);
  const [loadingShares, setLoadingShares] = useState(false);
  const [sharesLoaded, setSharesLoaded]   = useState(false);

  // Load past sends when modal opens (once)
  if (!sharesLoaded && !loadingShares) {
    setLoadingShares(true);
    fetch(`/api/projects/${projectId}/share`)
      .then(r => r.json())
      .then(d => { setPastShares(d.shares || []); setSharesLoaded(true); setLoadingShares(false); })
      .catch(() => { setSharesLoaded(true); setLoadingShares(false); });
  }

  function addEmail() { setEmails(prev => [...prev, '']); }
  function removeEmail(i) { setEmails(prev => prev.filter((_, idx) => idx !== i)); }
  function setEmail(i, v) { setEmails(prev => prev.map((e, idx) => idx === i ? v : e)); }

  async function handleSend() {
    const validEmails = emails.map(e => e.trim()).filter(Boolean);
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: validEmails, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create share link');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function copyLink(url) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Send Budget</h2>
            <p className="text-sm text-slate-500 mt-0.5">{projectName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-1 -mt-1">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {result ? (
            /* ── Success state ── */
            <div>
              <div className="flex items-center gap-2 text-green-600 mb-4">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold">Share link created!</span>
              </div>

              <p className="text-sm text-slate-600 mb-3">
                Copy the link below and share it with your client. Each time they open it, the view is tracked.
              </p>

              <div className="flex gap-2">
                <input
                  readOnly
                  value={result.shareUrl}
                  className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-700 select-all"
                  onClick={e => e.target.select()}
                />
                <button
                  onClick={() => copyLink(result.shareUrl)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Est. Budget</span>
                  <span className="font-semibold text-slate-600">{formatCurrency(totalBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Views</span>
                  <span className="font-semibold text-slate-600">0</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="mt-5 w-full px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Compose state ── */
            <>
              {/* Recipients */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">To</label>
                <div className="space-y-2">
                  {emails.map((email, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="email"
                        placeholder="client@example.com"
                        value={email}
                        onChange={e => setEmail(i, e.target.value)}
                        className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      {emails.length > 1 && (
                        <button
                          onClick={() => removeEmail(i)}
                          className="text-slate-400 hover:text-red-500 transition-colors px-2"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addEmail}
                  className="mt-2 text-sm text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add another recipient
                </button>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Message <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={4}
                  placeholder={`Hi,\n\nPlease find the conceptual lighting budget for ${projectName} attached below.`}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              {/* Budget preview */}
              <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Budget</div>
                  <div className="text-base font-bold text-slate-900">{formatCurrency(totalBudget)}</div>
                </div>
                <div className="text-xs text-slate-500 text-right">
                  <div>Recipients will see</div>
                  <div>a read-only summary</div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={sending || emails.every(e => !e.trim())}
                className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Creating link…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                    </svg>
                    Create Share Link &amp; Send
                  </>
                )}
              </button>
            </>
          )}

          {/* ── Past sends ── */}
          {sharesLoaded && pastShares && pastShares.length > 0 && (
            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Previous Sends</h3>
              <div className="space-y-2">
                {pastShares.map(s => {
                  const recipients = JSON.parse(s.sentTo || '[]');
                  const shareUrl = `${window.location.origin}/share/${s.token}`;
                  return (
                    <div key={s.id} className="bg-slate-50 rounded-lg px-3 py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-600 font-medium truncate">
                          {recipients.length > 0 ? recipients.join(', ') : 'No recipients'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatDate(s.sentAt)} · {s.viewCount || 0} view{s.viewCount !== 1 ? 's' : ''}
                          {s.lastViewedAt && ` · Last viewed ${formatDate(s.lastViewedAt)}`}
                        </div>
                      </div>
                      <button
                        onClick={() => copyLink(shareUrl)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-semibold whitespace-nowrap"
                      >
                        Copy link
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
