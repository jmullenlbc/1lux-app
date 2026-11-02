'use client';
import { useCallback, useEffect, useState } from 'react';
import { TaskCard, TaskForm, useTaskActions } from '@/components/desk/TasksTab';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { DESK_CHANGED } from '@/lib/desk/desk';
import { localDay, sortTasks } from '@/lib/desk/tasks';
import { BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';

// The tasks connected to one company, person or project (Mike 11-1). The same
// tasks as My Desk, with the same card and form. Client logins get nothing here.

const PRESET = { client: 'clients', contact: 'contacts', project: 'projects' };

export default function RecordTasks({ kind, id, name }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(false);
  const [editing, setEditing] = useState(null); // 'new' or a task

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sales/tasks?${kind}=${encodeURIComponent(id)}`);
      if (r.status === 403) { setHidden(true); return; }
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(out.error || `The server could not load the tasks. Nothing changed. Refresh the page to try again. (code ${r.status})`); return; }
      setData(out); setErr('');
    } catch {
      setErr('The app could not reach the server to load the tasks. Nothing changed. Check your connection and refresh the page.');
    }
  }, [kind, id]);
  useEffect(() => { load(); }, [load]);

  const after = () => { load(); window.dispatchEvent(new Event(DESK_CHANGED)); };
  const actions = useTaskActions(setData, setErr, after);

  if (hidden) return null;
  if (!data) return err ? <p role="alert" className="text-sm text-red-700">{err}</p> : <WidgetLoading />;

  const today = localDay();
  return (
    <div className="max-w-2xl py-2">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-700">Tasks</h3>
        <span className="text-xs text-slate-500 tabular-nums">{data.tasks.length}</span>
        <button type="button" className={`${BTN_COMPACT_PRIMARY} ml-auto`} onClick={() => setEditing('new')}>New task</button>
      </div>
      {err && <p role="alert" className="mb-2 text-sm text-red-700">{err}</p>}
      {!data.tasks.length && <p className="py-4 text-sm text-slate-500">No tasks yet.</p>}
      <div className="space-y-2">
        {sortTasks(data.tasks).map(t => <TaskCard key={t.id} task={t} onOpen={setEditing} actions={actions} today={today} />)}
      </div>
      {editing && (
        <TaskForm task={editing === 'new' ? null : editing} preset={{ [PRESET[kind]]: [{ id, name }] }}
          tags={data.tags} people={data.salesPeople} viewerId={data.viewerId} canMakeTags={data.canMakeTags}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); after(); }}
          onTagAdded={t => setData(d => (d.tags.some(x => x.id === t.id) ? d : { ...d, tags: [...d.tags, t].sort((a, b) => a.name.localeCompare(b.name)) }))} />
      )}
    </div>
  );
}
