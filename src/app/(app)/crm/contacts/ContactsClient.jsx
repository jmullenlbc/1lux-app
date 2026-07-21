'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

function checkInStatus(contact) {
  const ref = contact.lastInPersonAt ?? contact.lastTouchpointAt;
  if (!ref || !contact.cadenceTier) return null;
  const effectiveDays = contact.cadenceDays ?? contact.client?.cadenceDays ?? 90;
  const elapsed = Math.floor((Date.now() - new Date(ref)) / 86_400_000);
  const daysOverdue = elapsed - effectiveDays;
  if (daysOverdue > 0) return 'overdue';
  if (daysOverdue > -14) return 'due_soon';
  return 'ok';
}

const STATUS = {
  overdue: { cls: 'text-red-600 font-semibold', label: 'Overdue' },
  due_soon: { cls: 'text-amber-600 font-semibold', label: 'Due Soon' },
  ok: { cls: 'text-green-700', label: 'Current' },
};

function fmtDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ContactsClient({ contacts }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.client?.name?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <Link href="/crm" className="text-sm text-slate-500 hover:text-slate-700 mb-2 block">
          ← Back to CRM
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-1">Contacts</h1>
        <p className="text-slate-500 mb-6">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</p>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search by name, email, title, company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="text-slate-400">No contacts found.</p>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Company / Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Last Contact</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(contact => {
                  const status = checkInStatus(contact);
                  return (
                    <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {contact.client?.id ? (
                          <Link
                            href={`/clients/${contact.client.id}`}
                            className="hover:text-blue-600 underline"
                          >
                            {contact.name}
                          </Link>
                        ) : (
                          contact.name
                        )}
                        {contact.preferredName && (
                          <div className="text-xs text-slate-500">{contact.preferredName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {contact.company || contact.client?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{contact.title || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{contact.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {fmtDate(contact.lastInPersonAt ?? contact.lastTouchpointAt) || '—'}
                      </td>
                      <td className={`px-4 py-3 ${status ? STATUS[status].cls : ''}`}>
                        {status ? STATUS[status].label : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
