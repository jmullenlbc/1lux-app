'use client';
/**
 * Read the site data block off a site plan and apply it to Project Info.
 *
 * ── Why this panel looks the way it does ─────────────────────────────────────
 * Three of the fields it fills, lot SF, surface parking stalls, exterior
 * amenity SF, are on `projectInputChecks.js`'s critical list, meaning the
 * budget engine reads them as zero when blank and prices whole sections at $0
 * without saying so. Filling them from the drawing is the point of this panel.
 * That also sets the design constraint: a wrong number here is worse than a
 * missing one, because a missing one raises the existing missing-inputs warning
 * and a wrong one just quietly becomes a budget.
 *
 * So nothing here is applied by default reasoning. Every field is a tick box the
 * reviewer has to leave on, every value is editable in place, and a field that
 * would REPLACE a number somebody already entered is called out rather than
 * silently overwriting it. Pressing Apply is the write, and it is also the
 * verdict, the server diffs what was applied against what the model read.
 *
 * @see src/lib/siteFields.js, the translation and the writable allowlist
 * @see src/lib/agent/autoChecks.js, the arithmetic shown in CheckList
 * @see src/lib/agent/siteDiff.js, what Apply records
 */
import { useState, useRef, useCallback } from 'react';
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';
import { postParked } from '@/lib/parkedFetch';
import ReadingWait, { READING_TIME_HINT } from '@/components/ReadingWait';
import { BUILDING_TYPES, buildingTypeLabel } from '@/lib/utils';
import { siteFeatureFindings, SITE_FEATURE_KINDS_SENTENCE } from '@/lib/siteFeatureWords';

const STYLE_LABELS = { small: "Small breezeway", long: "Long breezeway" };

function fmt(n) {
  if (n == null) return '—';
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString() : (STYLE_LABELS[n] || buildingTypeLabel(n));
}

// ── automatic checks ─────────────────────────────────────────────────────────
// Shown at the moment somebody is deciding whether to apply, not only in
// /admin/agent-runs. A contradiction found after the numbers are in a budget is
// a correction; found before, it is just a fix.
function CheckList({ review }) {
  if (!review || !Array.isArray(review.checks) || review.checks.length === 0) return null;

  const failed  = review.checks.filter(c => c.status === 'FAIL');
  const skipped = review.checks.filter(c => c.status === 'SKIP');
  const passed  = review.checks.filter(c => c.status === 'PASS');

  if (failed.length === 0) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-xs text-green-800 flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>
          <span className="font-semibold">{passed.length} automatic check{passed.length !== 1 ? 's' : ''} passed.</span>
          {' '}The lot, the parking and the unit count all agree with each other.
          {skipped.length > 0 && (
            <span className="text-green-700/70"> {skipped.length} check{skipped.length !== 1 ? 's' : ''} couldn&apos;t run, the drawing didn&apos;t state enough to compare.</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <span className="text-sm font-semibold text-red-800">
          {failed.length} automatic check{failed.length !== 1 ? 's' : ''} failed
        </span>
      </div>
      <ul className="space-y-1.5 text-xs text-red-700">
        {failed.map(c => (
          <li key={c.key} className="flex gap-2">
            <span className="text-red-400 shrink-0">•</span>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] text-red-600/80 border-t border-red-200 pt-2">
        These are arithmetic, not opinions, something the drawing says contradicts something else it says.
        Fix the numbers below before applying, or untick the ones you don&apos;t trust.
      </p>
    </div>
  );
}

// ── one proposed field ───────────────────────────────────────────────────────
function FieldRow({ row, checked, value, onToggle, onChange }) {
  return (
    <div className={`px-4 py-3 flex items-start gap-3 ${checked ? '' : 'opacity-50'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onToggle(e.target.checked)}
        className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-orange-500 shrink-0"
        aria-label={`Apply ${row.label}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-700">{row.label}</span>
          {row.critical && (
            <span
              className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
              title="Blank, the budget engine reads this as zero and prices this section at $0."
            >
              Prices at $0 if blank
            </span>
          )}
        </div>
        {row.note && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{row.note}</p>}
        {row.overwrites && (
          <p className="text-[11px] text-amber-700 mt-1 leading-snug">
            Replaces {fmt(row.current)} already entered on this project.
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {row.unit === 'style' ? (
          // Small vs long breezeway, read off the drawings; it lands on the
          // Corridors answer, not in Project Info (Mike 10-14 "Prefill").
          <select
            value={value ?? ''}
            disabled={!checked}
            onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
            className="w-56 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400"
            aria-label="Breezeway style"
          >
            <option value="">Not set</option>
            <option value="small">Small breezeway</option>
            <option value="long">Long breezeway</option>
          </select>
        ) : row.unit === 'type' ? (
          // The building type is a pick from the engine's list, not a number
          // the reader's pick is pre-selected and the reviewer can change it.
          <select
            value={value ?? ''}
            disabled={!checked}
            onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
            className="w-56 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400"
            aria-label="Building type"
          >
            <option value="">Not set</option>
            {BUILDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        ) : (
          <input
            type="number"
            value={value ?? ''}
            disabled={!checked}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className="w-32 text-right bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm font-mono tabular-nums outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        )}
        <div className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wide">
          {row.unit === 'sf' ? 'sq ft' : row.unit === 'style' ? 'breezeway style' : row.unit === 'type' ? 'building type' : row.unit === 'ft' ? 'feet' : 'count'}
          {row.sheet ? ` · sheet ${row.sheet}` : ''}
        </div>
      </div>
    </div>
  );
}

// ── what the drawing said but we do not write ────────────────────────────────
// The unit count is the reason this extraction is worth governing, and it is
// deliberately read-only: the unit matrix owns that field and a person already
// signed off on it. Showing it as evidence and refusing to write it is the
// whole point, two extractors racing for one number is how an accepted value
// gets silently overwritten by a less careful read.
function ReadOnlyEvidence({ site }) {
  const bits = [
    site?.totalUnits != null && ['Units stated on the drawing', fmt(site.totalUnits)],
    site?.parkingProvided != null && ['Parking provided', fmt(site.parkingProvided)],
    site?.parkingRequired != null && ['Parking required by code', fmt(site.parkingRequired)],
  ].filter(Boolean);
  if (!bits.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
        Also read, not written to the project
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {bits.map(([label, v]) => (
          <div key={label} className="flex justify-between gap-2 text-xs">
            <dt className="text-slate-500 truncate">{label}</dt>
            <dd className="font-mono tabular-nums text-slate-700">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-slate-500 mt-2.5 border-t border-slate-200 pt-2 leading-snug">
        The unit count is used to check this reading against the unit matrix, it is never written over it.
        Change unit counts in the unit matrix, not here.
      </p>
    </div>
  );
}

// `onCommitted(projectData)` is optional: the questionnaires pass it so their
// form and live budget refresh the moment an apply lands, without a reload.
// The Takeoffs tab omits it and behaves exactly as before.
export default function SiteDataUpload({ projectId, onCommitted }) {
  const [state, setState]   = useState('idle');   // idle|uploading|parsing|reviewing|saving|error
  // When the read started, purely so the wait can be counted out loud. A
  // drawing is read by a model sheet by sheet; it is minutes, not a page load.
  const [readingSince, setReadingSince] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [picked, setPicked] = useState({});       // key → { on, value }
  const [errMsg, setErrMsg] = useState('');
  const [toast, setToast]   = useState(null);
  const inputRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  const handleFiles = useCallback((files) => {
    if (!files?.length) return;
    const file = files[0];
    if (file.name.split('.').pop()?.toLowerCase() !== 'pdf') {
      setErrMsg('Site data is read from a PDF site plan. Please upload the site or concept plan as a PDF.');
      setState('error');
      return;
    }
    uploadAndParse(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function uploadAndParse(file) {
    setState('uploading');
    setErrMsg('');

    // Check the size before sending, a 4 MB+ body is rejected by the host before
    // it ever reaches us, and "Upload failed, please try again" is a lie there:
    // retrying the same file never works.
    const tooBig = oversizeMessage(file);
    if (tooBig) { setErrMsg(tooBig); setState('error'); return; }

    const formData = new FormData();
    // Its own tab, not 'drawings'. Uploading to 'drawings' fires the "new drawing
    // set" notification to everybody on the project, and a sheet read for its
    // site data block is not a drawing issue.
    formData.append('tab', 'site-plan');

    let fileId;
    try {
      // Straight to S3 for PDFs, site plans are routinely over the 4 MB
      // front-door cap.
      await appendUpload(formData, file, { scope: 'project' });
      const r = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: formData });
      if (!r.ok) throw new Error(await uploadErrorMessage(r, file));
      fileId = (await r.json()).file?.id;
    } catch (e) {
      setErrMsg(e.message || 'Upload failed. Please try again.');
      setState('error');
      return;
    }

    setState('parsing');
    setReadingSince(Date.now());
    try {
      // Park-and-poll: the read runs in steps behind the front door and the
      // answer arrives with the same body and status it always had.
      const r = await postParked(`/api/projects/${projectId}/site/parse`, { fileId });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || d.error || 'Extraction failed');

      if (!d.proposal?.length) {
        setErrMsg('Nothing readable was found on that sheet. Site data usually sits in a "SITE DATA" or "PROJECT DATA" block, try the sheet that has one.');
        setState('error');
        return;
      }

      setParsed(d);
      // Everything starts ticked ON, because the reviewer is here to say no to
      // specific fields, not to re-enter them all. What starts OFF is nothing
      // an unticked default would make ignoring the panel the easy path.
      setPicked(Object.fromEntries(d.proposal.map(r2 => [r2.key, { on: true, value: r2.value }])));
      setState('reviewing');
    } catch (e) {
      setErrMsg(e.message || 'Extraction failed. Please try again.');
      setState('error');
    }
  }

  async function apply() {
    const fields = {};
    // Which sheet each site feature was read from, so the row can say so.
    const sheets = {};
    for (const [key, v] of Object.entries(picked)) {
      if (v.on && v.value != null && v.value !== '') fields[key] = v.value;
    }
    // Rows still at the standard length (courtyard 60 ft each, 0115). Typing a
    // different number makes it a person's figure, so the tag drops.
    const assumed = {};
    for (const row of parsed?.proposal ?? []) {
      if (fields[row.key] != null && row.sheet) sheets[row.key] = row.sheet;
      if (fields[row.key] != null && row.lengthAssumed && Number(fields[row.key]) === Number(row.value)) assumed[row.key] = true;
    }
    if (!Object.keys(fields).length) {
      setErrMsg('Nothing is ticked, so there is nothing to apply.');
      return;
    }

    setState('saving');
    try {
      const r = await fetch(`/api/projects/${projectId}/site/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // runId ties this apply back to the extraction that produced it, so the
        // server can diff what was applied against what the model read and
        // record the verdict itself. See src/lib/agent/siteDiff.js.
        body: JSON.stringify({ fileId: parsed?.fileId, fields, sheets, assumed, runId: parsed?.review?.runId ?? null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Could not save.');

      const n = d.written?.length ?? 0;
      showToast(`${n} site field${n !== 1 ? 's' : ''} written to Project Info`);
      setParsed(null);
      setPicked({});
      setState('idle');
      if (d.projectData) onCommitted?.(d.projectData, d.answers || null);
    } catch (e) {
      setErrMsg(e.message || 'Could not save. Please try again.');
      setState('reviewing');
    }
  }

  const busy = state === 'uploading' || state === 'parsing' || state === 'saving';
  const tickedCount = Object.values(picked).filter(v => v.on && v.value != null).length;

  return (
    <div className="mb-6">
      <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-2">Site Data</div>

      {state !== 'reviewing' && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-7 text-center"
        >
          <p className="text-sm font-medium text-slate-700">
            {busy
              ? (state === 'uploading' ? 'Uploading…' : state === 'parsing' ? 'Reading the drawing…' : 'Saving…')
              : 'Drop a site or concept plan PDF'}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto leading-snug">
            Reads the SITE DATA block, lot size, parking, building count and amenity area, and fills the Project Info
            fields that price at $0 when they are left blank. Numbers are never counted off the drawing;
            only what is written on it is reported.
          </p>
          {state === 'parsing'
            ? <ReadingWait startedAt={readingSince} className="mt-1.5" />
            : !busy && <p className="text-[11px] text-slate-400 mt-1.5">{READING_TIME_HINT}</p>}
          {!busy && (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-3 px-4 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600"
              >
                Choose PDF
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </>
          )}
          {state === 'error' && errMsg && (
            <p className="mt-3 text-xs text-red-600 max-w-lg mx-auto">{errMsg}</p>
          )}
        </div>
      )}

      {state === 'reviewing' || state === 'saving' ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{parsed?.fileName}</div>
              <div className="text-[11px] text-slate-400">
                {parsed?.site?.foundSiteDataBlock
                  ? 'Read from a site data block on the sheet'
                  : 'Read from callouts on the sheet, no single data block found'}
                {parsed?.review?.tier && <> · {parsed.review.tier}</>}
              </div>
            </div>
            <button
              onClick={() => { setParsed(null); setPicked({}); setState('idle'); }}
              className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
            >
              Discard
            </button>
          </div>

          <div className="p-4 space-y-3">
            <CheckList review={parsed?.review} />

            {/* Site features named on the sheet, said plainly before the rows
                (Mike 2026-09-16: "If we find 1 dog park it should say that").
                The rows below carry each one into Project Data; the budget
                prices each on its own Exterior line. */}
            {(() => {
              const found = siteFeatureFindings(parsed?.site?.siteFeatures);
              return found.length > 0 ? (
                <p className="text-xs text-slate-700 leading-snug px-1">
                  <span className="font-semibold text-slate-800">Named on this sheet:</span>{' '}
                  {found.join(' · ')}
                  <span className="text-slate-500">, each gets its own line under Exterior &amp; Site.</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 leading-snug px-1">
                  No {SITE_FEATURE_KINDS_SENTENCE} is named on this sheet, none will be priced unless typed in.
                </p>
              );
            })()}

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {(parsed?.proposal ?? []).map(row => (
                <FieldRow
                  key={row.key}
                  row={row}
                  checked={picked[row.key]?.on ?? false}
                  value={picked[row.key]?.value ?? null}
                  onToggle={on => setPicked(p => ({ ...p, [row.key]: { ...p[row.key], on } }))}
                  onChange={value => setPicked(p => ({ ...p, [row.key]: { ...p[row.key], value } }))}
                />
              ))}
            </div>

            <ReadOnlyEvidence site={parsed?.site} />

            {parsed?.site?.notes && (
              <p className="text-[11px] text-slate-500 leading-snug px-1">
                <span className="font-semibold text-slate-600">What the reader saw:</span> {parsed.site.notes}
              </p>
            )}

            {errMsg && <p className="text-xs text-red-600">{errMsg}</p>}
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {tickedCount} of {parsed?.proposal?.length ?? 0} field{(parsed?.proposal?.length ?? 0) !== 1 ? 's' : ''} will be written
            </span>
            <button
              onClick={apply}
              disabled={state === 'saving' || tickedCount === 0}
              className="px-4 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-500 disabled:bg-slate-300"
            >
              {state === 'saving' ? 'Applying…' : 'Apply to Project'}
            </button>
          </div>
        </div>
      ) : null}

      {toast && (
        <div className="mt-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
          {toast}
        </div>
      )}
    </div>
  );
}
