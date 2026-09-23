'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { companyLink, countMissingCompany } from '@/lib/crmClient';
import { ALL_CONTACT_DEPARTMENTS, contactDepartmentLabel } from '@/lib/contactDepartments';

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

/**
 * Who a person works for — and, when we do not know, say so out loud rather than
 * printing a dash that looks like every other blank field.
 */
function CompanyCell({ contact }) {
  const { state, label } = companyLink(contact);

  if (state === 'linked') {
    return contact.client?.id
      ? <Link href={`/clients/${contact.client.id}`} className="hover:text-blue-600 underline">{label}</Link>
      : <span>{label}</span>;
  }
  if (state === 'typed') {
    return (
      <span>
        {label}
        <span className="ml-2 text-xs text-amber-700" title="Typed by hand — not linked to a client record, so nothing about this person rolls up to that company">
          not linked
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
      No company
    </span>
  );
}

export default function ContactsClient({ contacts }) {
  const [search, setSearch] = useState('');
  // Since a person now survives their company being deleted, people with no
  // employer at all can appear on their own. This makes them findable instead of
  // leaving them scattered down a long list.
  const [onlyMissingCompany, setOnlyMissingCompany] = useState(false);
  const [department, setDepartment] = useState('');

  // Deep links land here already filtered. The Things Needing a Look card on the
  // Main dashboard sends people to a specific duplicated email address or to the
  // people with no company, and dropping them into an unfiltered list of
  // everyone would waste the click. Read on mount rather than during render, so
  // the server and the browser agree on the first paint.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) setSearch(q);
    if (params.get('missing') === 'company') setOnlyMissingCompany(true);
  }, []);

  const missingCompany = useMemo(() => countMissingCompany(contacts), [contacts]);

  const filtered = useMemo(() => {
    let rows = contacts;
    if (onlyMissingCompany) rows = rows.filter(c => companyLink(c).state === 'none');
    if (department) rows = rows.filter(c => c.department === department);
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.client?.name?.toLowerCase().includes(q) ||
      contactDepartmentLabel(c.department)?.toLowerCase().includes(q)
    );
  }, [contacts, search, onlyMissingCompany, department]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <Link href="/crm" className="text-sm text-slate-500 hover:text-slate-700 mb-2 block">
          ← Back to CRM
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-1">Contacts</h1>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <p className="text-slate-500">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</p>
          {missingCompany > 0 && (
            <button
              type="button"
              onClick={() => setOnlyMissingCompany(v => !v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                onlyMissingCompany
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
              }`}
              title="People with no employer at all — neither a linked client nor a typed company name"
            >
              {missingCompany} with no company{onlyMissingCompany ? ' — showing only these' : ''}
            </button>
          )}
        </div>

        {/* Search + department */}
        <div className="mb-6 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Search by name, email, title, company, department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <select
            value={department}
            onChange={e => setDepartment(e.target.value)}
            title="Show only one department"
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="">All departments</option>
            {ALL_CONTACT_DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Department</th>
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
                        <CompanyCell contact={contact} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{contact.title || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{contactDepartmentLabel(contact.department) || '—'}</td>
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
