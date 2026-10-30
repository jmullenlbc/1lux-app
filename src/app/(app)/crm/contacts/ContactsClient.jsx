'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { companyLink, countMissingCompany } from '@/lib/crmClient';
import { ALL_CONTACT_DEPARTMENTS, CONTACT_DEPARTMENTS, contactDepartmentLabel } from '@/lib/contactDepartments';
import LookAlikeReviews from '@/components/crm/LookAlikeReviews';
import SectionTabs, { PIPELINE_TABS } from '@/components/ui/SectionTabs';
import { FilterToolbar, FilterPanel, SearchBox, countFilters } from '@/components/ui/FilterPanel';
import SortHeader, { sortRows } from '@/components/ui/SortHeader';
import { useUrlView } from '@/lib/useUrlView';
import BulkEditBar, { useBulkPicks } from '@/components/ui/BulkEditBar';

const BULK_FIELDS = [
  { key: 'title',      label: 'Title',      kind: 'text' },
  { key: 'department', label: 'Department', kind: 'choice', options: CONTACT_DEPARTMENTS.map(d => ({ value: d.key, label: d.label })) },
];
import { CARD, BTN_COMPACT, BTN_COMPACT_PRIMARY, H1, TD, TH } from '@/components/ui/tokens';

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
  { key: 'tag',        label: 'Tag',        kind: 'pick' },
];
const PANEL_FIELDS = FILTER_FIELDS.filter(f => f.key !== 'q');
const SORT_KEYS = ['name', 'company', 'title', 'department', 'email', 'lastContact', 'checkin'];
const VIEW_FIELDS = [...FILTER_FIELDS, ...SORT_KEYS.map(k => ({ key: k, kind: 'sort' }))];
const SORT_DEFAULT = { key: 'name', dir: 'asc' };
const STATUS_RANK = { overdue: 0, due_soon: 1, ok: 2 };

const tagNames = c => (c.tagLinks || []).map(l => l.tag?.name).filter(Boolean);

// A branch reads "Parent, Market" so it sorts under its parent company.
function companyChoices(companies) {
  return companies
    .map(c => ({ value: c.id, label: c.parent ? `${c.parent.name}, ${c.branchMarket || c.name}` : c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function ContactsClient({ contacts, tags = [], companies = [] }) {
  const bulkFields = useMemo(() => [
    ...BULK_FIELDS,
    { key: 'clientId', label: 'Company or branch', kind: 'choice', options: companyChoices(companies) },
  ], [companies]);
  const router = useRouter();
  const { filters, setFilter, clearFilters, sort, toggleSort } = useUrlView({ fields: VIEW_FIELDS, sortDefault: SORT_DEFAULT });
  const [open, setOpen] = useState(false);
  const search = filters.q || '';
  // Since a person now survives their company being deleted, people with no
  // employer at all can appear on their own. This makes them findable instead of
  // leaving them scattered down a long list.
  const onlyMissingCompany = filters.missing === 'company';
  const department = filters.department || '';
  const tag = filters.tag || '';

  const missingCompany = useMemo(() => countMissingCompany(contacts), [contacts]);

  const filtered = useMemo(() => {
    let rows = contacts;
    if (onlyMissingCompany) rows = rows.filter(c => companyLink(c).state === 'none');
    if (department) rows = rows.filter(c => c.department === department);
    if (tag) rows = rows.filter(c => (c.tagLinks || []).some(l => l.tag?.id === tag));
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.client?.name?.toLowerCase().includes(q) ||
      contactDepartmentLabel(c.department)?.toLowerCase().includes(q) ||
      tagNames(c).some(n => n.toLowerCase().includes(q))
    );
  }, [contacts, search, onlyMissingCompany, department, tag]);

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
    tag:        tags.map(t => [t.id, t.name]),
  };
  const filterCount = countFilters(filters, FILTER_FIELDS);

  // Row checkboxes + Select all, then one bar to add or take off a tag for
  // everyone picked (people tags, 0141), and one to edit or archive them
  // (Mike 10-29). Picks hidden by the filter are ignored.
  const bulk = useBulkPicks(sorted.map(c => ({ id: c.id, active: !c.archivedAt })), '/api/crm/contacts/bulk', 'CONTACT_BULK');
  const picked = bulk.picked;
  const [bulkTag, setBulkTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const shownIds = sorted.map(c => c.id);
  const pickedShown = bulk.pickedIds;
  const allShownPicked = bulk.allPicked;
  const togglePick = bulk.toggle;
  const toggleAll = bulk.toggleAll;

  async function runBulkTag(remove) {
    if (!pickedShown.length || bulkBusy) return;
    setBulkBusy(true); setBulkMsg('');
    try {
      let tagId = bulkTag;
      let tagName = tags.find(t => t.id === tagId)?.name;
      if (!tagId && newTag.trim() && !remove) {
        const res = await fetch('/api/contact-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTag.trim() }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.tag) { setBulkMsg(d.error || `Could not make that tag, the server said no. Nothing was changed. Try again. (TAG_CREATE_${res.status})`); return; }
        tagId = d.tag.id; tagName = d.tag.name;
      }
      if (!tagId) { setBulkMsg('Pick a tag or type a new one first. Nothing was changed.'); return; }
      const res = await fetch(`/api/contact-tags/${tagId}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactIds: pickedShown, remove }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setBulkMsg(d.error || `Could not reach the server, so nothing was changed. Try again. (BULK_TAG_${res.status})`); return; }
      setBulkMsg(remove ? `Took "${tagName}" off ${d.removed} people.` : `Tagged ${d.added} people "${tagName}".`);
      setNewTag(''); bulk.clear();
      router.refresh();
    } finally { setBulkBusy(false); }
  }

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
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={allShownPicked} onChange={toggleAll} disabled={!shownIds.length} className="w-4 h-4 accent-orange-500" />
            <span>Select all{shownIds.length ? ` (${shownIds.length})` : ''}</span>
            {pickedShown.length > 0 && <span className="ml-auto font-semibold text-slate-800 tabular-nums">{pickedShown.length} picked</span>}
          </label>
          {pickedShown.length > 0 && (
            <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-slate-700 flex flex-wrap items-center gap-2">
              <select value={bulkTag} onChange={e => setBulkTag(e.target.value)} disabled={bulkBusy}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
                <option value="">{tags.length ? 'Pick a tag' : 'No tags yet'}</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {!bulkTag && (
                <input value={newTag} onChange={e => setNewTag(e.target.value)} disabled={bulkBusy} placeholder="or type a new tag"
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs w-44" />
              )}
              <button type="button" className={BTN_COMPACT_PRIMARY} disabled={bulkBusy || (!bulkTag && !newTag.trim())} onClick={() => runBulkTag(false)}>Add tag</button>
              <button type="button" className={BTN_COMPACT} disabled={bulkBusy || !bulkTag} onClick={() => runBulkTag(true)}>Take tag off</button>
              {bulkBusy && <span>Saving…</span>}
            </div>
          )}
          {bulkMsg && <p className="mt-2 text-xs text-slate-700">{bulkMsg}</p>}
          <div className="mt-2">
            <BulkEditBar count={pickedShown.length} noun="people" fields={bulkFields} archived={bulk.archived} busy={bulk.busy}
              onApply={set => bulk.run(set, 'Changed')}
              onArchive={archive => bulk.run({ active: !archive }, archive ? 'Archived' : 'Restored')}
              onClear={bulk.clear} />
          </div>
          {bulk.err && <p className="mt-2 text-xs text-red-600">{bulk.err}</p>}
          {bulk.msg && <p className="mt-2 text-xs text-green-700">{bulk.msg}</p>}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No contacts found.</p>
        ) : (
          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-8 px-3 py-2"><span className="sr-only">Pick</span></th>
                  <SortHeader field="name" label="Name" sort={sort} onSort={toggleSort} />
                  <SortHeader field="company" label="Company / Client" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="title" label="Title" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="department" label="Department" sort={sort} onSort={toggleSort} />
                  <SortHeader className="hidden md:table-cell" field="email" label="Email" sort={sort} onSort={toggleSort} />
                  <th className={`hidden md:table-cell ${TH}`}>Tags</th>
                  <SortHeader className="hidden md:table-cell" field="lastContact" label="Last Contact" sort={sort} onSort={toggleSort} />
                  <SortHeader field="checkin" label="Check-in" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(contact => {
                  const status = checkInStatus(contact);
                  return (
                    <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                      <td className="w-8 px-3 py-2">
                        <input type="checkbox" checked={picked.has(contact.id)} onChange={() => togglePick(contact.id)} aria-label={`Pick ${contact.name}`} className="w-4 h-4 accent-orange-500" />
                      </td>
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
                      <td className={`hidden md:table-cell ${TD}`}>
                        <div className="flex flex-wrap gap-1">
                          {tagNames(contact).map(n => (
                            <span key={n} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">{n}</span>
                          ))}
                        </div>
                      </td>
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
