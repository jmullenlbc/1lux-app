'use client';

import { useState } from 'react';
import Link from 'next/link';

const STATUS_CONFIG = {
  PENDING: { color: 'bg-amber-100 text-amber-700 border border-amber-200', label: 'Pending' },
  APPROVED: { color: 'bg-green-100 text-green-700 border border-green-200', label: 'Approved' },
  REJECTED: { color: 'bg-red-100 text-red-700 border border-red-200', label: 'Rejected' },
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function IntakeClient({ submissions, clients, projects, currentUser }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = submissions.find(s => s.id === selectedId);
  const [status, setStatus] = useState(selected?.status || 'PENDING');
  const [reviewNote, setReviewNote] = useState(selected?.reviewNote || '');
  const [clientId, setClientId] = useState(selected?.clientId || '');
  const [saving, setSaving] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/intake/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewNote,
          clientId: clientId || null,
          duplicateMatchId: linkedProjectId || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      
      setSelectedId(null);
      window.location.reload();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendInvite() {
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/admin/intake/${selected.id}/invite`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setInviteResult(data);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <Link href="/admin" className="text-xs text-slate-400 hover:text-amber-600 transition-colors mb-4 inline-block">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Conceptual Submissions</h1>

        <div className="grid grid-cols-3 gap-6">
          {/* List */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Company</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-12 text-center text-slate-500">
                        <p className="text-sm mb-3">No submissions yet.</p>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/start`;
                            navigator.clipboard.writeText(url);
                            alert('Copied: ' + url);
                          }}
                          className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded"
                        >
                          Copy /start link
                        </button>
                      </td>
                    </tr>
                  ) : submissions.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => {
                        setSelectedId(s.id);
                        setStatus(s.status);
                        setReviewNote(s.reviewNote || '');
                        setClientId(s.clientId || '');
                        setLinkedProjectId(s.duplicateMatchId ?? '');
                        setInviteResult(null);
                        setInviteError(null);
                        setCopied(false);
                      }}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedId === s.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(s.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.submitterName}</td>
                      <td className="px-4 py-3 text-slate-600">{s.submitterEmail}</td>
                      <td className="px-4 py-3 text-slate-600">{s.proposedName}</td>
                      <td className="px-4 py-3 text-slate-600">{s.buildingType || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CONFIG[s.status].color}`}>
                          {STATUS_CONFIG[s.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Review Submission</h2>

              <div className="space-y-4">
                {/* Fields */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Name</label>
                  <p className="text-slate-600">{selected.submitterName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Email</label>
                  <a href={`mailto:${selected.submitterEmail}`} className="text-blue-600 hover:underline text-sm">
                    {selected.submitterEmail}
                  </a>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Company</label>
                  <p className="text-slate-600">{selected.proposedName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Building Type</label>
                  <p className="text-slate-600">{selected.buildingType || '—'}</p>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Link Client</label>
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">None</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Review Note</label>
                  <textarea
                    value={reviewNote}
                    onChange={e => setReviewNote(e.target.value)}
                    placeholder="Internal notes..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setStatus('PENDING');
                      setReviewNote('');
                      setClientId('');
                      setLinkedProjectId('');
                      setInviteResult(null);
                      setInviteError(null);
                      setCopied(false);
                    }}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>

                {selected.status === 'APPROVED' && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      Portal Access
                    </p>

                    {/* Part A: Link to project */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Linked Project
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={linkedProjectId}
                        onChange={e => setLinkedProjectId(e.target.value)}
                      >
                        <option value="">— not linked —</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-1">
                        Pick the project, save above, then send the invite below.
                      </p>
                    </div>

                    {/* Part B: Send invite */}
                    <div>
                      {inviteResult?.alreadyAccepted ? (
                        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                          ✓ {inviteResult.submitterEmail} already has portal access for this project.
                        </p>
                      ) : inviteResult?.inviteUrl ? (
                        <div>
                          <p className="text-xs text-slate-600 mb-1">
                            Invite ready — copy this link and send it to {inviteResult.submitterEmail}:
                          </p>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={inviteResult.inviteUrl}
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono bg-slate-50"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(inviteResult.inviteUrl);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold whitespace-nowrap"
                            >
                              {copied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          disabled={!selected.duplicateMatchId || inviting}
                          onClick={handleSendInvite}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            selected.duplicateMatchId && !inviting
                              ? 'bg-amber-500 hover:bg-amber-400 text-white'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {inviting ? 'Sending…' : 'Send Portal Invite'}
                        </button>
                      )}

                      {inviteError && (
                        <p className="text-xs text-red-500 mt-2">{inviteError}</p>
                      )}
                      {!selected.duplicateMatchId && (
                        <p className="text-xs text-slate-400 mt-1">
                          Link a project above and save first.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
