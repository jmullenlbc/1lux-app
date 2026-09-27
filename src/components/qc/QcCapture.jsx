'use client';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { initQcRecorder } from './qcRecorder';

const MODULES = [
  'Admin / Users', 'Budget / Wizard', 'Change Orders', 'Client Portal',
  'CRM / Pipeline', 'Design Bid Matrix', 'Drawings', 'Fixture Schedule',
  'Knowledge Base', 'Market Intelligence', 'Peer Review', 'Proposals',
  'RFIs', 'Ship Schedule', 'Submittal Tracker', 'Other',
];

function parseBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  if (ua.includes('Edg/'))          browser = `Edge ${(ua.match(/Edg\/([\d]+)/) || [])[1] || ''}`;
  else if (ua.includes('Chrome/'))  browser = `Chrome ${(ua.match(/Chrome\/([\d]+)/) || [])[1] || ''}`;
  else if (ua.includes('Firefox/')) browser = `Firefox ${(ua.match(/Firefox\/([\d]+)/) || [])[1] || ''}`;
  else if (ua.includes('Safari/'))  browser = `Safari ${(ua.match(/Version\/([\d]+)/) || [])[1] || ''}`;
  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac'))  os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  return [browser, os].filter(Boolean).join(' · ');
}

function parseProjectId(url) {
  const m = String(url).match(/\/project\/([^/?#]+)/);
  return m ? m[1] : null;
}

export default function QcCapture() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [screenshotUrl, setSsUrl] = useState(null);
  const [screenshotBlob, setSsBlob] = useState(null);
  const [ctxOpen, setCtxOpen]     = useState(false);
  const [consoleSnap, setConsole] = useState([]);
  const [networkSnap, setNetwork] = useState([]);
  const [form, setForm]           = useState({
    title: '', severity: 'MAJOR', module: 'Other',
    description: '', expected: '', actual: '', pageUrl: '',
  });

  useEffect(() => { initQcRecorder(); }, []);

  async function handleOpen() {
    setOpen(true);
    setForm(f => ({ ...f, pageUrl: window.location.href }));
    const qc = window.__ilcQc;
    setConsole(qc?.consoleLog || []);
    setNetwork(qc?.networkLog || []);
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(document.body, { cacheBust: true, pixelRatio: 1 });
      setSsBlob(blob);
      setSsUrl(URL.createObjectURL(blob));
    } catch {
      setSsBlob(null);
      setSsUrl(null);
    }
  }

  function handleClose() {
    setOpen(false);
    setSsUrl(null);
    setSsBlob(null);
    setCtxOpen(false);
    setConsole([]);
    setNetwork([]);
    setForm({ title: '', severity: 'MAJOR', module: 'Other', description: '', expected: '', actual: '', pageUrl: '' });
  }

  async function handleSubmit() {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setLoading(true);
    try {
      const qc = window.__ilcQc;
      const fd = new FormData();
      if (screenshotBlob) fd.append('screenshot', screenshotBlob, 'screenshot.png');
      fd.append('meta', JSON.stringify({
        title:         form.title.trim(),
        description:   form.description.trim(),
        severity:      form.severity,
        module:        form.module,
        pageUrl:       form.pageUrl,
        expectedText:  form.expected.trim(),
        actualText:    form.actual.trim(),
        consoleJson:   JSON.stringify(consoleSnap),
        networkJson:   JSON.stringify(networkSnap),
        pageStateJson: qc?.getContext?.() ? JSON.stringify(qc.getContext()) : null,
        browserInfo:   parseBrowserInfo(),
        viewport:      `${window.innerWidth} x ${window.innerHeight}`,
        projectId:     parseProjectId(form.pageUrl),
      }));

      const res = await fetch('/api/qc/reports', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('submit failed');
      toast.success('Bug reported — thank you!');
      handleClose();
    } catch {
      toast.error('Failed to submit — try again');
    } finally {
      setLoading(false);
    }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const inputCls = 'mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';
  const labelCls = 'text-[11px] font-semibold text-slate-400 uppercase tracking-wider';

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-40 md:bottom-20 right-4 md:right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold shadow-lg transition-colors print:hidden"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="8" y="6" width="8" height="14" rx="4"/>
          <path d="M12 6V3M5 9l3 1M19 9l-3 1M4 14h4M16 14h4M6 19l2-1M18 19l-2-1"/>
        </svg>
        Report a bug
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-800">Report a bug</div>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Screenshot */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={labelCls}>Screenshot</span>
                  <span className="text-[10px] font-semibold text-green-600">
                    {screenshotUrl ? '✓ Captured' : 'Capturing…'}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 min-h-[80px] flex items-center justify-center">
                  {screenshotUrl
                    ? <img src={screenshotUrl} alt="Page screenshot" className="w-full max-h-44 object-cover object-top" />
                    : <span className="text-[11px] text-slate-400">Capturing page…</span>
                  }
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Snapshot of the current page taken automatically.</div>
              </div>

              {/* Screen recording — v1.1 */}
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 opacity-50 cursor-not-allowed select-none">
                <div>
                  <div className="text-sm text-slate-600 font-medium">Add screen recording</div>
                  <div className="text-[10px] text-slate-400">Coming soon</div>
                </div>
                <div className="w-11 h-6 rounded-full bg-slate-200 relative shrink-0">
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow" />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className={labelCls}>Title <span className="text-red-400 normal-case">*</span></label>
                <input value={form.title} onChange={set('title')} type="text"
                  placeholder="Short summary of what's broken" className={inputCls} />
              </div>

              {/* Severity + Module */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Severity</label>
                  <select value={form.severity} onChange={set('severity')} className={inputCls}>
                    <option value="MAJOR">Major</option>
                    <option value="MINOR">Minor</option>
                    <option value="COSMETIC">Cosmetic</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Module</label>
                  <select value={form.module} onChange={set('module')} className={inputCls}>
                    {MODULES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* What happened */}
              <div>
                <label className={labelCls}>What happened</label>
                <textarea value={form.description} onChange={set('description')} rows={3}
                  placeholder="Steps to reproduce, what you saw instead… If this was a math issue, please put the number expected and the number that was calculated in the software."
                  className={inputCls} />
              </div>

              {/* Page URL */}
              <div>
                <label className={labelCls}>Page URL</label>
                <input value={form.pageUrl} onChange={set('pageUrl')} type="text"
                  className={`${inputCls} font-mono text-[12px] text-slate-600 bg-slate-50`} />
                <div className="text-[10px] text-slate-400 mt-1">Auto-filled. Editable if the bug was on a different page.</div>
              </div>

              {/* Auto-captured context */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60">
                <button
                  onClick={() => setCtxOpen(x => !x)}
                  className="w-full flex items-center justify-between px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <svg className={`transition-transform duration-150 ${ctxOpen ? 'rotate-90' : ''}`}
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M9 6l6 6-6 6"/>
                    </svg>
                    Auto-captured silently
                  </span>
                  <span className="text-[10px] text-green-600 font-semibold">✓ Attached</span>
                </button>
                {ctxOpen && (
                  <div className="px-3 pb-3 space-y-2 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Browser</span>
                      <span>{parseBrowserInfo()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Viewport</span>
                      <span className="font-mono">{window.innerWidth} x {window.innerHeight}</span>
                    </div>
                    {consoleSnap.length > 0 && (
                      <div>
                        <span className="text-slate-400">Console ({consoleSnap.length})</span>
                        <div className="mt-1 rounded-lg bg-slate-900 text-red-300 font-mono text-[10px] px-2.5 py-2 leading-relaxed max-h-20 overflow-y-auto">
                          {consoleSnap.slice(-3).map((e, i) => (
                            <div key={i}>{e.level === 'error' ? '✕' : '⚠'} {e.msg}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {networkSnap.length > 0 && (
                      <div>
                        <span className="text-slate-400">Failed requests ({networkSnap.length})</span>
                        <div className="mt-1 rounded-lg bg-slate-900 text-amber-300 font-mono text-[10px] px-2.5 py-2 leading-relaxed max-h-20 overflow-y-auto">
                          {networkSnap.slice(-3).map((e, i) => (
                            <div key={i}>{e.status} {e.method} {String(e.url).replace(/^https?:\/\/[^/]+/, '')}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {consoleSnap.length === 0 && networkSnap.length === 0 && (
                      <p className="text-slate-400 text-[10px]">No console errors or failed requests captured.</p>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={handleClose}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-semibold">
                {loading ? 'Submitting…' : 'Submit report'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
