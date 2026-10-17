'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { companyLink, countMissingCompany } from '@/lib/crmClient';
import { ALL_CONTACT_DEPARTMENTS, contactDepartmentLabel } from '@/lib/contactDepartments';
import LookAlikeReviews from '@/components/crm/LookAlikeReviews';
import SectionTabs, { PIPELINE_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { useUrlView } from '@/lib/useUrlView';
import { CARD, BTN_COMPACT, H1, TD } from '@/components/ui/tokens';

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
 * Who a person works for, and, when we do not know, say so out loud rather than
 * printing a dash that looks like every other blank field.
 */
function CompanyCell({ contact }) {
  const { state, label } = companyLink(contact);

  if (state === 'linked') {
    return contact.client?.id
      ? <Link href={`/clients/${contact.client.id}`} className="hover:text-orange-600 underline">{label}</Link>
      : <span>{label}</span>;
  }
  if (state === 'typed') {
    return (
      <span>
        {label}
        <span className="ml-2 text-xs text-amber-700" title="Typed by hand, not linked to a client record, so nothing about this person rolls up to that company">
          not linked
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
      No company
    </span>
  );
}

// Filters and sort live in the address (useUrlView). `q` and `missing=company`
// are the deep-link names the Things Needing a Look card already sends.
const FILTER_FIELDS = [
  { key: 'q',          label: 'Search',     kind: 'text' },
  { key: 'department', label: 'Department', kind: 'pick' },
  { key: 'missing',    label: 'Company',    kind: 'pick' },
];
const PANEL_FIELDS = FILTER_FIELDS.filter(f => f.key !== 'q');
const SORT_KEYS = ['name', 'company', 'title', 'department', 'email', 'lastContact', 'checkin'];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'name', dir: 'asc' };
const STATUS_RANK = { overdue: 0, due_soon: 1, ok: 2 };

export default function ContactsClient({ contacts }) {
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [open, setOpen] = useState(false);
  const search = filters.q || '';
  // Since a person now survives their company being deleted, people with no
  // employer at all can appear on their own. This makes them findable instead of
  // leaving them scattered down a long list.
  const onlyMissingCompany = filters.missing === 'company';
  const department = filters.department || '';

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

  const sorted = useMemo(() => sortRows(filtered, sort, {
    name:        c => c.name || '',
    company:     c => companyLink(c).label || '',
    title:       c => c.title || '',
    department:  c => contactDepartmentLabel(c.department) || '',
    email:       c => c.email || '',
    lastContact: c => { const d = c.lastInPersonAt ?? c.lastTouchpointAt; return d ? new Date(d).getTime() : null; },
    checkin:     c => { const s = checkInStatus(c); return s ? STATUS_RANK[s] : null; },
  }), [filtered, sort]);

  const choices = {
    department: ALL_CONTACT_DEPARTMENTS.map(d => [d.key, d.label]),
    missing:    [['company', 'No company']],
  };
  const filterCount = countFilters(filters, FILTER_FIELDS);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Pipeline / Contacts / Check-ins tabs (Mike 10-6) replace the back link. They sit
          outside the centered column so the tab line starts at the left like every other page. */}
      <SectionTabs tabs={PIPELINE_TABS} className="mb-5" />
      <div className="max-w-7xl mx-auto">
        <h1 className={`${H1} mb-1`}>Contacts</h1>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {missingCompany > 0 && (
            <button
              type="button"
              onClick={() => setFilter('missing', onlyMissingCompany ? '' : 'company')}
              className={`${BTN_COMPACT} ${
                onlyMissingCompany
                  ? 'border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-50'
                  : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
              }`}
              title="People with no employer at all, neither a linked client nor a typed company name"
            >
              {missingCompany} with no company{onlyMissingCompany ? ', showing only these' : ''}
            </button>
          )}
        </div>

        <div className="mb-6"><LookAlikeReviews kind="contact" title="Same person?" /></div>

        {/* Filter + search */}
        <div className="mb-6">
          <FilterToolbar
            count={filterCount}
            open={open}
            onToggle={() => setOpen(o => !o)}
            onClear={clearFilters}
            shown={filtered.length}
            total={contacts.length}
            noun="contacts"
            right={<SearchBox value={search} onChange={v => setFilter('q', v)} placeholder="Search by name, email, title, company, department..." className="w-80" />}
          />
          <FilterPanel open={open} fields={PANEL_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No contacts found.</p>
        ) : (
          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <SortHeader field="name" label="Name" sort={sort} onSort={toggleSort} />
                  <SortHeader field="company" label="Company / Client" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="title" label="Title" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="department" label="Department" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="email" label="Email" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="lastContact" label="Last Contact" sort={sort} onSort={toggleSort} />
                  <SortHeader field="checkin" label="Check-in" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(contact => {
                  const status = checkInStatus(contact);
                  return (
                    <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`${TD} font-semibold text-slate-900`}>
                        {contact.client?.id ? (
                          <Link
                            href={`/clients/${contact.client.id}`}
                            className="hover:text-orange-600 underline"
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
                      <td className={TD}>
                        <CompanyCell contact={contact} />
                      </td>
                      <td className={`hidden md:table-cell ${TD}`}>{contact.title || '—'}</td>
                      <td className={`hidden md:table-cell ${TD}`}>{contactDepartmentLabel(contact.department) || '—'}</td>
                      <td className={`hidden md:table-cell ${TD}`}>{contact.email || '—'}</td>
                      <td className={`hidden md:table-cell ${TD} tabular-nums`}>
                        {fmtDate(contact.lastInPersonAt ?? contact.lastTouchpointAt) || '—'}
                      </td>
                      <td className={`${TD} ${status ? STATUS[status].cls : ''}`}>
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
