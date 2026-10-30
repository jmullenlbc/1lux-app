'use client';
import { useState, useEffect } from 'react';
import { CARD, LABEL, INPUT, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, HELPER, H2 } from '@/components/ui/tokens';

const PERMISSIONS = [
  { key: 'canViewShipSchedule',      label: 'Ship Schedule' },
  { key: 'canViewSubmittals',        label: 'Submittals' },
  { key: 'canViewMeetings',          label: 'Meeting Notes' },
  { key: 'canViewContracts',         label: 'Contracts' },
  { key: 'canViewConstructionSched', label: 'Construction Sched' },
  { key: 'canViewChangeOrders',      label: 'Change Orders' },
  { key: 'canViewBudgets',           label: 'Budgets' },
];

function PermCheckbox({ label, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="w-3.5 h-3.5 rounded accent-orange-500"
      />
      <span className="text-xs text-slate-600">{label}</span>
    </label>
  );
}

function InviteStatus({ contact }) {
  if (contact.acceptedAt) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Active
      </span>
    );
  }
  if (contact.invitedAt) {
    return (
      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        Invite Sent
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
      No Invite
    </span>
  );
}

function ContactCard({ contact, projectId, onUpdated, onDeleted }) {
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending,setResending]= useState(false);
  const [perms,    setPerms]    = useState(() =>
    Object.fromEntries(PERMISSIONS.map(p => [p.key, contact[p.key]]))
  );

  async function savePerms(newPerms) {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/contacts/${contact.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(newPerms),
    });
    if (res.ok) {
      const { contact: updated } = await res.json();
      onUpdated(updated);
    }
    setSaving(false);
  }

  function togglePerm(key) {
    const next = { ...perms, [key]: !perms[key] };
    setPerms(next);
    savePerms(next);
  }

  async function resendInvite() {
    setResending(true);
    const res = await fetch(`/api/projects/${projectId}/contacts/${contact.id}/invite`, { method: 'POST' });
    if (res.ok) alert('Invite email resent.');
    else {
      const d = await res.json();
      alert(d.error || 'Failed to resend invite');
    }
    setResending(false);
  }

  async function del() {
    if (!confirm(`Remove ${contact.name} from this project?`)) return;
    setDeleting(true);
    await fetch(`/api/projects/${projectId}/contacts/${contact.id}`, { method: 'DELETE' });
    onDeleted(contact.id);
  }

  return (
    <div className={`${CARD} p-5 ${saving ? 'opacity-70' : ''}`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-orange-600">{contact.name[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">{contact.name}</p>
            <p className="text-xs text-slate-500">{contact.email}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{contact.role}</p>
          </div>
        </div>
        <InviteStatus contact={contact} />
      </div>

      {/* Permissions grid */}
      <div className="mb-4">
        <p className={`${LABEL} mb-2`}>Portal Access</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PERMISSIONS.map(p => (
            <PermCheckbox
              key={p.key}
              label={p.label}
              checked={perms[p.key]}
              onChange={() => togglePerm(p.key)}
              disabled={saving}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
        {!contact.acceptedAt && (
          <button
            onClick={resendInvite}
            disabled={resending}
            className={`${BTN_COMPACT} flex-1 disabled:opacity-60`}
          >
            {resending ? 'Sending...' : contact.invitedAt ? 'Resend Invite' : 'Send Invite'}
          </button>
        )}
        {contact.acceptedAt && (
          <div className="flex-1 text-xs text-slate-500 text-center tabular-nums">
            Accepted {new Date(contact.acceptedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
        <button
          onClick={del}
          disabled={deleting}
          className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
        >
          {deleting ? '...' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

function AddContactForm({ projectId, onAdded, onCancel }) {
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [role,  setRole]  = useState('General Contractor');
  const [perms, setPerms] = useState(Object.fromEntries(PERMISSIONS.map(p => [p.key, false])));
  const [saving,setSaving]= useState(false);
  const [err,   setErr]   = useState('');

  function togglePerm(key) {
    setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setErr('Name and email are required'); return; }
    setErr('');
    setSaving(true);

    const res = await fetch(`/api/projects/${projectId}/contacts`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role, ...perms }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setErr(data.error || 'Failed to add contact'); }
    else { onAdded(data.contact); }
  }

  return (
    <form onSubmit={submit} className={`${CARD} p-5`}>
      <h3 className="font-semibold text-slate-800 text-sm mb-4">New External Contact</h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={`block ${LABEL} mb-1`}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className={INPUT} />
        </div>
        <div>
          <label className={`block ${LABEL} mb-1`}>Email *</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
            className={INPUT} />
        </div>
      </div>

      <div className="mb-4">
        <label className={`block ${LABEL} mb-1`}>Role</label>
        <input value={role} onChange={e => setRole(e.target.value)}
          placeholder="e.g. General Contractor, Electrician, Owner"
          className={INPUT} />
      </div>

      <div className="mb-4">
        <p className={`${LABEL} mb-2`}>Portal Access</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PERMISSIONS.map(p => (
            <PermCheckbox key={p.key} label={p.label} checked={perms[p.key]} onChange={() => togglePerm(p.key)} />
          ))}
        </div>
      </div>

      {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className={`${BTN_PRIMARY} flex-1 disabled:opacity-60`}>
          {saving ? 'Adding...' : 'Add & Send Invite'}
        </button>
        <button type="button" onClick={onCancel}
          className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ContactsTab({ projectId }) {
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/contacts`)
      .then(r => r.json())
      .then(d => { setContacts(d.contacts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  function handleAdded(contact) {
    setContacts(prev => [...prev, contact]);
    setAdding(false);
  }
  function handleUpdated(updated) {
    setContacts(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  }
  function handleDeleted(id) {
    setContacts(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className={H2}>Client Portal Access</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage contractors and clients who have access to the project portal.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className={`${BTN_PRIMARY} flex items-center gap-1.5`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            + Add Project Contacts
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-5">
          <AddContactForm projectId={projectId} onAdded={handleAdded} onCancel={() => setAdding(false)} />
        </div>
      )}

      {/* Contact cards */}
      {loading ? (
        <div className="text-center py-10 text-sm text-slate-500">Loading...</div>
      ) : contacts.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-700">No external contacts yet</p>
          <p className={`${HELPER} mt-1`}>Add a contact to give them portal access</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contacts.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              projectId={projectId}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
