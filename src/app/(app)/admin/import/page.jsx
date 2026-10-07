'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { batchOversizeMessage, uploadErrorMessage } from '@/lib/uploadErrorMessage';
import { appendUploads } from '@/lib/uploadClient';

// ── Field display helpers ──────────────────────────────────────────────────────
function fmt(v) { return v != null ? v.toLocaleString() : '—'; }
function fmtAns(v) { return v || '—'; }

const BUILDING_TYPE_LABELS = {
  highRise: 'High Rise (12+)',
  midRise:  'Mid Rise (5–11)',
  podium:   'Podium',
  wrap:     'Wrap',
  garden:   'Garden',
  gurban:   'Urban Garden',
  stackedFlats: 'Stacked Flats',
  townHouses: 'Town Houses',
  singleFamily: 'Single Family',
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [stage, setStage]         = useState('upload');   // upload | parsing | review | importing | done
  const [dragging, setDragging]   = useState(false);
  const [parseError, setParseError] = useState('');
  const [projects, setProjects]   = useState([]);  // parsed preview data
  const [selected, setSelected]   = useState({});  // { index: bool }
  const [editNames, setEditNames] = useState({});   // { index: string } — editable project name
  const [editLocs, setEditLocs]   = useState({});   // { index: string } — editable location
  const [importResult, setImportResult] = useState(null);

  // ── File upload / drag-drop ──────────────────────────────────────────────
  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    const xlsxFiles = Array.from(files).filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    if (xlsxFiles.length === 0) {
      setParseError('Please upload .xlsx or .xls files only.');
      return;
    }
    // Spreadsheets go to S3 one at a time now, so each gets its own 25 MB rather
    // than the whole batch sharing 4 MB.
    const tooBig = batchOversizeMessage(xlsxFiles);
    if (tooBig) { setParseError(tooBig); return; }

    setParseError('');
    setStage('parsing');

    const fd = new FormData();

    try {
      await appendUploads(fd, xlsxFiles, { scope: 'project' });
      const res = await fetch('/api/admin/import', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await uploadErrorMessage(res, xlsxFiles[0]));
      const data = await res.json();

      const parsed = data.results || [];
      // Initialize selection state (all checked by default if parse OK)
      const sel = {};
      const names = {};
      const locs  = {};
      parsed.forEach((p, i) => {
        sel[i]   = p.ok;
        names[i] = p.name || '';
        locs[i]  = p.location || '';
      });
      setProjects(parsed);
      setSelected(sel);
      setEditNames(names);
      setEditLocs(locs);
      setStage('review');
    } catch (e) {
      setParseError(e.message);
      setStage('upload');
    }
  }, []);

  function onFileInputChange(e) { handleFiles(e.target.files); }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Import confirmed projects ─────────────────────────────────────────────
  async function handleImport() {
    const toImport = projects
      .map((p, i) => ({ ...p, name: editNames[i] || p.name, location: editLocs[i] || '' }))
      .filter((_, i) => selected[i] && projects[i].ok);

    if (toImport.length === 0) return;

    setStage('importing');
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: toImport }),
      });
      const data = await res.json();
      setImportResult(data);
      setStage('done');
    } catch (e) {
      setParseError(e.message);
      setStage('review');
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Link href="/dashboard" className="hover:text-slate-600 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-slate-600">Import from Excel</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Import Past Budgets</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload one or more ILC Studios conceptual budget Excel files. Project data and selections are extracted automatically.
        </p>
      </div>

      {/* ── UPLOAD STAGE ─────────────────────────────────────────────────── */}
      {(stage === 'upload' || stage === 'parsing') && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
              dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
            } ${stage === 'parsing' ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={onFileInputChange}
            />
            {stage === 'parsing' ? (
              <div className="flex flex-col items-center gap-3">
                <svg className="w-10 h-10 text-amber-500 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <p className="text-slate-600 font-medium">Parsing files…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Drop Excel files here, or click to browse</p>
                  <p className="text-sm text-slate-400 mt-1">Accepts .xlsx files — upload as many as you want at once</p>
                </div>
              </div>
            )}
          </div>

          {parseError && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          <div className="mt-6 bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700 mb-1.5">What gets imported:</p>
            <ul className="space-y-1 list-disc list-inside text-slate-500">
              <li>Project name and building type</li>
              <li>All SF fields (gross, units, corridors, amenity, garage, BOH)</li>
              <li>Unit counts (units, bedrooms, bathrooms, vanities, balconies, stairwells, parking)</li>
              <li>All questionnaire selections (undercabinet, fans, vanity, emergency, controls, etc.)</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── REVIEW STAGE ─────────────────────────────────────────────────── */}
      {stage === 'review' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="font-semibold text-slate-800">{projects.length} file{projects.length !== 1 ? 's' : ''} parsed</span>
              <span className="text-slate-400 text-sm ml-2">· {selectedCount} selected for import</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setStage('upload'); setProjects([]); }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                ← Upload More
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                Import {selectedCount} Project{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {projects.map((p, i) => (
              <div
                key={i}
                className={`bg-white rounded-xl border transition-colors ${
                  !p.ok ? 'border-red-200 bg-red-50' :
                  selected[i] ? 'border-amber-300' : 'border-slate-200 opacity-60'
                }`}
              >
                {/* Card header */}
                <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
                  {p.ok && (
                    <input
                      type="checkbox"
                      checked={!!selected[i]}
                      onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))}
                      className="mt-1 w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 flex-wrap">
                      {p.ok ? (
                        <>
                          <input
                            type="text"
                            value={editNames[i] || ''}
                            onChange={e => setEditNames(n => ({ ...n, [i]: e.target.value }))}
                            className="text-base font-semibold text-slate-900 border-0 border-b border-transparent hover:border-slate-300 focus:border-amber-400 focus:outline-none bg-transparent flex-1 min-w-0 py-0"
                            placeholder="Project name"
                          />
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                            {BUILDING_TYPE_LABELS[p.buildingType] || p.buildingType}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-red-700">{p.filename}</span>
                      )}
                    </div>
                    {p.ok && (
                      <div className="flex items-center gap-2 mt-1">
                        <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                        </svg>
                        <input
                          type="text"
                          value={editLocs[i] || ''}
                          onChange={e => setEditLocs(l => ({ ...l, [i]: e.target.value }))}
                          placeholder="City, State (optional)"
                          className="text-sm text-slate-500 border-0 border-b border-transparent hover:border-slate-300 focus:border-amber-400 focus:outline-none bg-transparent py-0 flex-1"
                        />
                        <span className="text-xs text-slate-300">· {p.filename}</span>
                      </div>
                    )}
                    {!p.ok && (
                      <p className="text-sm text-red-600 mt-1">{p.error}</p>
                    )}
                  </div>
                </div>

                {/* Data preview grid */}
                {p.ok && (
                  <div className="px-5 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2 mb-3">
                      <Metric label="Gross SF"    value={fmt(p.projectData?.grossSf)} />
                      <Metric label="Units SF"    value={fmt(p.projectData?.unitsSf)} />
                      <Metric label="# Units"     value={fmt(p.projectData?.numUnits)} />
                      <Metric label="Corridor SF" value={fmt(p.projectData?.corridorSf)} />
                      <Metric label="Int. Amenity SF" value={fmt(p.projectData?.interiorAmenitySf)} />
                      <Metric label="Garage SF"   value={fmt(p.projectData?.garageSf)} />
                      <Metric label="BOH SF"      value={fmt(p.projectData?.bohSf)} />
                      <Metric label="Ext. Amenity SF" value={fmt(p.projectData?.exteriorAmenitySf)} />
                      <Metric label="Parking Stalls" value={fmt(p.projectData?.numSurfaceParking)} />
                      <Metric label="Balconies"   value={fmt(p.projectData?.numBalconies)} />
                    </div>

                    {/* Questionnaire selections */}
                    <div className="border-t border-slate-50 pt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                      <Answer q="Undercabinet"     a={p.rawAnswers?.undercabinet} />
                      <Answer q="Kitchen Pendants" a={p.rawAnswers?.kitchenPendants} />
                      <Answer q="Ceiling Fans"     a={p.rawAnswers?.fans} />
                      <Answer q="Vanity"           a={p.rawAnswers?.vanity} />
                      <Answer q="Balcony"          a={p.rawAnswers?.balcony} />
                      <Answer q="Emergency"        a={p.rawAnswers?.emergency} />
                      <Answer q="Entry Sconce"     a={p.rawAnswers?.corridorSconce} />
                      <Answer q="Int. Amenities"   a={p.rawAnswers?.interiorAmenity} />
                      <Answer q="Ext. Amenities"   a={p.rawAnswers?.exteriorAmenity} />
                      <Answer q="Amenity Hours"    a={p.rawAnswers?.amenityHours} />
                      <Answer q="Energy Credit"    a={p.rawAnswers?.energyCredit} />
                    </div>

                    {/* Warnings */}
                    {p.warnings?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.warnings.map((w, wi) => (
                          <span key={wi} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">
                            ⚠ {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => { setStage('upload'); setProjects([]); }}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              ← Upload More
            </button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              Import {selectedCount} Project{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── IMPORTING STAGE ──────────────────────────────────────────────── */}
      {stage === 'importing' && (
        <div className="text-center py-16">
          <svg className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <p className="text-slate-600 font-medium">Creating projects…</p>
        </div>
      )}

      {/* ── DONE STAGE ───────────────────────────────────────────────────── */}
      {stage === 'done' && importResult && (
        <div>
          <div className="flex items-center gap-2 text-green-600 mb-6">
            <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <h2 className="text-lg font-bold">
              {importResult.created?.length} project{importResult.created?.length !== 1 ? 's' : ''} imported successfully
            </h2>
          </div>

          <div className="space-y-2 mb-6">
            {importResult.created?.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                <span className="font-medium text-slate-800">{p.name}</span>
                <Link
                  href={`/project/${p.id}`}
                  className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                >
                  Open →
                </Link>
              </div>
            ))}
            {importResult.failed?.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                <span className="font-medium text-red-700">{p.name} — {p.error}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => { setStage('upload'); setProjects([]); setImportResult(null); }}
              className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors"
            >
              Import More Files
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small display components ──────────────────────────────────────────────────

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}

function Answer({ q, a }) {
  if (!a) return null;
  return (
    <div className="flex gap-1 text-xs py-0.5">
      <span className="text-slate-400 w-28 shrink-0">{q}</span>
      <span className="text-slate-600 truncate" title={a}>{a}</span>
    </div>
  );
}
