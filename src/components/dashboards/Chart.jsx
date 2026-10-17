'use client';
// Self-contained Bar / Line chart (SVG only — no external lib, CSP-safe).
// props: { chartType:'BAR'|'LINE', series:[{label,value}], unit?, height? }

function fmtVal(v, unit) {
  if (v == null || isNaN(v)) return '—';
  if (unit === '$') {
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${Math.round(v).toLocaleString()}`;
  }
  if (unit === '%') return `${Math.round(v)}%`;
  if (unit === 'days') return `${Math.round(v)} days`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

export default function Chart({ chartType = 'BAR', series = [], unit, height = 170 }) {
  if (!series.length) {
    return <div className="flex items-center justify-center text-xs text-slate-500" style={{ height }}>No data</div>;
  }
  const W = 640, H = height, padX = 8, padTop = 18, padBottom = 26;
  const plotW = W - padX * 2, plotH = H - padTop - padBottom;
  // Drift-style series go negative; the baseline sits at zero and bars hang
  // below it. All-positive data keeps the original bottom baseline.
  const vals = series.map(s => Number(s.value) || 0);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const span = (max - min) || 1;
  const n = series.length;
  const step = plotW / n;
  const x = i => padX + step * i + step / 2;
  const y = v => padTop + ((max - v) / span) * plotH;
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {/* baseline (zero) */}
      <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="#e2e8f0" strokeWidth="1" />

      {chartType === 'LINE' ? (
        <>
          <polyline
            points={series.map((s, i) => `${x(i)},${y(s.value)}`).join(' ')}
            fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
          />
          {series.map((s, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(s.value)} r="3.5" fill="#f97316" />
              <text x={x(i)} y={y(s.value) - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#475569">{fmtVal(s.value, unit)}</text>
            </g>
          ))}
        </>
      ) : (
        series.map((s, i) => {
          const bw = Math.min(step * 0.6, 40);
          const bx = x(i) - bw / 2;
          const v = Number(s.value) || 0;
          const by = y(v);
          const top = Math.min(by, zeroY), h = Math.abs(zeroY - by);
          return (
            <g key={i}>
              <rect x={bx} y={top} width={bw} height={h} rx="4" fill={v < 0 ? '#ef4444' : '#f97316'} />
              <text x={x(i)} y={v < 0 ? by + 11 : by - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#475569">{fmtVal(v, unit)}</text>
            </g>
          );
        })
      )}

      {/* x labels */}
      {series.map((s, i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
          {String(s.label).length > 10 ? String(s.label).slice(0, 9) + '…' : s.label}
        </text>
      ))}
    </svg>
  );
}
