'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { NOTIFICATION_TYPES, NOTIFICATION_MODULES } from '@/lib/notificationTypes';
import { ROLE_LABEL } from '@/lib/roles';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { signatureBlock } from '@/lib/bot/emailStyle';
import MySignatureFields from '@/components/salesAutomation/MySignatureFields';
import { extractSentEmails } from '@/lib/tone/mbox';
import { postParked } from '@/lib/parkedFetch';

// ── Email Signature Section ───────────────────────────────────────────────────
// One company layout; your printed name, title, cell and optional office line
// are typed here. Every email the bot drafts for you ends with it (Mike 9-26).
function SignatureSection() {
  const [f, setF] = useState(null);
  const [template, setTemplate] = useState(undefined);
  useEffect(() => { fetch('/api/sales/signature').then(r => r.json()).then(d => setTemplate(d.template)).catch(() => {}); }, []);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">Email Signature</h2>
      <p className="text-xs text-slate-500 mb-4">Added under every email the bot drafts for you. Email comes from your account. The layout is the company one, set under Sales, Automation, Signature.</p>
      <MySignatureFields onChange={setF} />
      <div className="text-xs text-slate-500 mb-1 mt-4">Preview</div>
      <pre className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap font-sans">{(f && signatureBlock(f, template)) || 'Add your title and cell phone above.'}</pre>
    </div>
  );
}

// ── Tone Profile Section ──────────────────────────────────────────────────────
function ToneProfileSection({ email }) {
  const [profile,    setProfile]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [msg,        setMsg]        = useState(null); // { type: 'success'|'error', text }
  const fileRef = useRef(null);

  useEffect(() => {
    fetch('/api/users/tone-profile')
      .then(r => r.json())
      .then(d => { setProfile(d.profile || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      // Read here, send only the words: the file itself can be far too big to upload.
      const emails = await extractSentEmails(file, email, { max: 500,
        onProgress: (bytes, found) => setMsg({ type: 'info', text: `Reading your sent mail: ${Math.round(bytes / 1e6)} MB, ${found} emails so far` }),
      });
      if (emails.length < 5) throw new Error(`Only ${emails.length} sent emails found in that file. Export your Sent mail and try again.`);
      setMsg({ type: 'info', text: `Learning your voice from ${emails.length} emails` });
      let added = 0;
      for (let i = 0; i < emails.length; i += 200) {
        const res = await fetch('/api/sales/voice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, source: 'MBOX', emails: emails.slice(i, i + 200) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
        added += d.added || 0;
      }
      const res = await postParked('/api/sales/voice/rebuild', {});
      const d = await res.json();
      if (!res.ok || d.rebuildError) throw new Error(d.rebuildError || d.message || d.error || `Error ${res.status}`);
      setProfile(d.profile);
      setMsg({ type: 'success', text: `Added ${added} new emails. Your voice is now learned from ${d.count} emails.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Email Tone Profile</h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload your sent email export so the bot learns to write in your voice.
            Each person has their own profile, so your style stays yours. Only the words you wrote are sent; the file stays on your computer.
          </p>
        </div>
        <a href="/sales/automation/voice" className="text-xs text-orange-600 hover:underline shrink-0">Open Voice Training</a>
      </div>

      {loading ? (
        <WidgetLoading />
      ) : profile ? (
        <div className="space-y-3">
          {/* Profile summary */}
          <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-1">Your writing voice:</p>
            <p>{profile.summary}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Tone</p>
              <div className="flex flex-wrap gap-1">
                {(profile.tone || []).map(t => (
                  <span key={t} className="text-[11px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Avoids</p>
              <div className="flex flex-wrap gap-1">
                {(profile.avoids || []).map(a => (
                  <span key={a} className="text-[11px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{a}</span>
                ))}
              </div>
            </div>
          </div>
          {profile.exampleOpener && (
            <div className="border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Example opener (your voice)</p>
              <p className="text-xs text-slate-700 italic">"{profile.exampleOpener}"</p>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-500">Re-upload anytime to refresh your profile</p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Analyzing…' : 'Re-upload .mbox'}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
          <svg className="w-8 h-8 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <p className="text-sm font-medium text-slate-600 mb-1">No tone profile yet</p>
          <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">
            In Google Takeout pick Mail, then only the <strong>Sent</strong> label. Unzip and upload the .mbox here. Any size works.
            Claude Sonnet will analyze your writing style and build a personal voice profile.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Analyzing emails…' : 'Upload Sent.mbox'}
          </button>
          <p className="text-[11px] text-slate-500 mt-2">Analyzed locally, emails are not stored</p>
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-xs rounded-lg px-3 py-2 ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : msg.type === 'info' ? 'bg-slate-50 text-slate-600 border border-slate-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
        </p>
      )}

      <input ref={fileRef} type="file" accept=".mbox" className="hidden" onChange={handleUpload} />
    </div>
  );
}

// Internal-only notification types and modules for the profile page
const INTERNAL_MODULES = NOTIFICATION_MODULES
  .map(m => ({ ...m, keys: m.keys.filter(k => NOTIFICATION_TYPES[k]?.external === false) }))
  .filter(m => m.keys.length > 0);

const PATTERN_LABEL = { EVENT: 'Immediate', DIGEST: 'Wed Digest', THRESHOLD: 'Daily check' };


function InternalNotificationsSection() {
  const [prefs,   setPrefs]   = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(null); // notificationType being saved
  const [dismissedDryRun, setDismissedDryRun] = useState(false);

  useEffect(() => {
    fetch('/api/user/preferences')
      .then(r => r.json())
      .then(d => {
        try { setPrefs(JSON.parse(d.notificationPrefs || '{}')); } catch { setPrefs({}); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    await fetch('/api/user/preferences', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notificationPrefs: JSON.stringify(next) }),
    });
    setSaving(null);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Internal Notifications</h2>
        <p className="text-xs text-slate-500 mt-1">
          Choose which ILC-internal alerts you want to receive across all projects.
          These notify you about events on your own team's work, not external contacts.
        </p>
      </div>

      {!dismissedDryRun && (
        <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-[11px] text-amber-800 flex-1">
            Email delivery is in dry-run mode. Preferences are saved and will take effect when Outlook is connected.
          </p>
          <button
            onClick={() => setDismissedDryRun(true)}
            className="p-1 text-amber-500 hover:text-amber-600 shrink-0"
            title="Dismiss"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {loading ? (
        <WidgetLoading />
      ) : (
        <div className="space-y-3">
          {INTERNAL_MODULES.map(({ module, keys }) => (
            <div key={module} className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-600">{module}</span>
              </div>
              {keys.map(key => {
                const meta    = NOTIFICATION_TYPES[key];
                const enabled = prefs[key] !== false; // default on
                return (
                  <div key={key} className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 ${saving === key ? 'opacity-60' : ''}`}>
                    <button
                      onClick={() => toggle(key)}
                      disabled={saving === key}
                      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 `}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
                    </button>
                    <span className={`flex-1 text-sm ${enabled ? 'text-slate-700' : 'text-slate-500'}`}>
                      {meta?.label || key}
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {PATTERN_LABEL[meta?.pattern] || meta?.pattern}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfileClient({ user }) {
  const router = useRouter();

  // ── Name editing ──────────────────────────────────────────────────────────
  const [name,        setName]        = useState(user?.name || '');
  const [savingName,  setSavingName]  = useState(false);
  const [nameMsg,     setNameMsg]     = useState(null);

  async function handleSaveName() {
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNameMsg({ type: 'success', text: 'Name updated.' });
      router.refresh();
    } catch (err) {
      setNameMsg({ type: 'error', text: err.message });
    } finally {
      setSavingName(false);
    }
  }

  // ── Home base ─────────────────────────────────────────────────────────────
  const [home,       setHome]       = useState(null);
  const [savingHome, setSavingHome] = useState(false);
  const [homeMsg,    setHomeMsg]    = useState(null);

  useEffect(() => {
    fetch('/api/user/preferences').then(r => (r.ok ? r.json() : null))
      .then(d => setHome({ homeCity: d?.homeCity || '', homeState: d?.homeState || '' })).catch(() => setHome({ homeCity: '', homeState: '' }));
  }, []);

  async function handleSaveHome() {
    setSavingHome(true);
    setHomeMsg(null);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(home),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Your home did not save on our server. Try again. (HTTP ${res.status})`);
      setHomeMsg({ type: 'success', text: 'Home updated.' });
    } catch (err) {
      setHomeMsg({ type: 'error', text: err instanceof TypeError ? 'No signal reaching our server. Your home was not saved. Check your connection and try again.' : err.message });
    } finally {
      setSavingHome(false);
    }
  }

  // ── Password change ────────────────────────────────────────────────────────
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg,    setPwMsg]    = useState(null);

  async function handleChangePw() {
    if (pw.next.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    setSavingPw(true);
    setPwMsg(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setSavingPw(false);
    }
  }

  const initials = (user?.name || user?.email || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account information and password.</p>
      </div>

      {/* Avatar + role card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-orange-500 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-800">{user?.name || user?.email}</div>
            <div className="text-sm text-slate-500">{user?.email}</div>
            <span className="inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
              {ROLE_LABEL[user?.role] || user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Display name */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Display Name</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={handleSaveName}
            disabled={savingName || !name.trim() || name.trim() === (user?.name || '')}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
        {nameMsg && (
          <p className={`text-xs mt-2 ${nameMsg.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {nameMsg.text}
          </p>
        )}
      </div>

      {/* Home base */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Home</h2>
        <p className="text-xs text-slate-500 mb-4">Where your trips start from, for travel costs.</p>
        <div className="flex gap-3">
          <input
            type="text"
            aria-label="Home city"
            value={home?.homeCity || ''}
            disabled={!home}
            onChange={e => setHome(h => ({ ...h, homeCity: e.target.value }))}
            placeholder="Denver"
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            type="text"
            aria-label="Home state"
            maxLength={2}
            value={home?.homeState || ''}
            disabled={!home}
            onChange={e => setHome(h => ({ ...h, homeState: e.target.value.toUpperCase() }))}
            placeholder="CO"
            className="w-16 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={handleSaveHome}
            disabled={savingHome || !home}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40"
          >
            {savingHome ? 'Saving…' : 'Save'}
          </button>
        </div>
        {homeMsg && (
          <p className={`text-xs mt-2 ${homeMsg.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {homeMsg.text}
          </p>
        )}
      </div>

      {/* Change password */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Change Password</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Current password</label>
            <input
              type="password"
              value={pw.current}
              onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">New password</label>
            <input
              type="password"
              value={pw.next}
              onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirm new password</label>
            <input
              type="password"
              value={pw.confirm}
              onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoComplete="new-password"
            />
          </div>
        </div>
        {pwMsg && (
          <p className={`text-xs mt-2 ${pwMsg.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {pwMsg.text}
          </p>
        )}
        <button
          onClick={handleChangePw}
          disabled={savingPw || !pw.current || !pw.next || !pw.confirm}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40"
        >
          {savingPw ? 'Changing…' : 'Change password'}
        </button>
      </div>

      <InternalNotificationsSection />
      <SignatureSection />
      <ToneProfileSection email={user?.email} />
    </div>
  );
}
