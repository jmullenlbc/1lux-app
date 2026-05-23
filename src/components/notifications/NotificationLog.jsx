'use client';
import { useState, useEffect } from 'react';
import { NOTIFICATION_TYPES } from '@/lib/notify';

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AudienceBadge({ audience }) {
  return audience === 'EXTERNAL'
    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">EXT</span>
    : <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-mono">INT</span>;
}

function PatternBadge({ type }) {
  const meta    = NOTIFICATION_TYPES[type];
  const pattern = meta?.pattern || 'EVENT';
  const styles  = {
    EVENT:     'bg-green-50 text-green-700 border-green-200',
    DIGEST:    'bg-blue-50 text-blue-700 border-blue-200',
    THRESHOLD: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const labels = { EVENT: 'Event', DIGEST: 'Digest', THRESHOLD: 'Threshold' };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${styles[pattern]}`}>
      {labels[pattern]}
    </span>
  );
}

function LogRow({ log }) {
  const meta    = NOTIFICATION_TYPES[log.notificationType];
  const label   = meta?.label || log.notificationType.replace(/_/g, ' ');
  const opened  = !!log.openedAt;

  let payloadSummary = '';
  try {
    const p = JSON.parse(log.payload || '{}');
    if (p.manufacturer) payloadSummary = p.manufacturer;
    else if (p.submissionName) payloadSummary = p.submissionName;
    else if (p.fileName) payloadSummary = p.fileName;
    else if (p.milestone) payloadSummary = p.milestone;
    else if (p.expiryDate) payloadSummary = `expires ${p.expiryDate}`;
    else if (p.eventCount) payloadSummary = `${p.eventCount} event${p.eventCount !== 1 ? 's' : ''}`;
  } catch {}

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
      {/* Audience badge */}
      <AudienceBadge audience={log.audience} />

      {/* Label + recipient */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {log.recipientEmail && (
            <span className="text-xs text-slate-400 truncate max-w-[180px]">{log.recipientEmail}</span>
          )}
          {payloadSummary && (
            <span className="text-xs text-slate-300">·</span>
          )}
          {payloadSummary && (
            <span className="text-xs text-slate-400 truncate">{payloadSummary}</span>
          )}
        </div>
      </div>

      {/* Pattern badge */}
      <PatternBadge type={log.notificationType} />

      {/* Opened indicator (external only) */}
      {log.audience === 'EXTERNAL' && (
        opened ? (
          <span
            title={`Opened ${new Date(log.openedAt).toLocaleString()}`}
            className="flex items-center gap-1 text-[10px] text-green-600 font-semibold"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Opened
          </span>
        ) : (
          <span className="text-[10px] text-slate-300 font-medium">Unopened</span>
        )
      )}

      {/* Timestamp */}
      <span className="text-xs text-slate-400 shrink-0">{relativeTime(log.sentAt)}</span>
    </div>
  );
}

export default function NotificationLog({ projectId }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all'); // 'all' | 'external' | 'internal'

  useEffect(() => {
    fetch(`/api/projects/${projectId}/notification-logs`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  const visible = logs.filter(l => {
    if (filter === 'external') return l.audience === 'EXTERNAL';
    if (filter === 'internal') return l.audience === 'INTERNAL';
    return true;
  });

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Notification Activity</h3>
          <p className="text-xs text-slate-400 mt-0.5">Last 100 log entries, most recent first</p>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
          {[['all', 'All'], ['external', 'External'], ['internal', 'Internal']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === val ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-slate-400">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No notifications logged yet</p>
          <p className="text-xs text-slate-400 mt-1">Events will appear here as they are triggered</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {visible.map(log => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
