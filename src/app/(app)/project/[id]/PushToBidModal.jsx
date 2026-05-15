'use client';
import { useState } from 'react';

export default function PushToBidModal({ projectId, itemCount, onPushed, onClose }) {
  const [tag,      setTag]      = useState('');
  const [pushing,  setPushing]  = useState(false);
  const [error,    setError]    = useState(null);

  async function doPush() {
    setPushing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/fixture-schedule/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionTag: tag.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Push failed');
      }
      const data = await res.json();
      onPushed(data);
    } catch (e) {
      setError(e.message);
      setPushing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Push to Design Bid Matrix</h2>
            <p className="text-xs text-slate-400 mt-0.5">This publishes the current draft as a versioned snapshot</p>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-700">{itemCount} fixture row{itemCount !== 1 ? 's' : ''} will be published</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-slate-700">Catalog # fields with <code className="bg-slate-200 rounded px-1 text-xs">+</code> separators will be split into individual bid line items</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-slate-700">Pricing (DN/CN) will carry forward from the previous bid where type + part number match</span>
            </div>
          </div>

          {/* Submission tag */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Submission tag <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
              placeholder="e.g. CD Package, 100% DD, GMP Estimate…"
              value={tag}
              onChange={e => setTag(e.target.value)}
              disabled={pushing}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={onClose}
              disabled={pushing}
            >
              Cancel
            </button>
            <button
              className="text-sm px-5 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              onClick={doPush}
              disabled={pushing}
            >
              {pushing && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                </svg>
              )}
              {pushing ? 'Pushing…' : 'Push to Bid'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
