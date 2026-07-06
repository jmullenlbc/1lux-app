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
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

export default function Chart({ chartType = 'BAR', series = [], unit, height = 170 }) {
  if (!series.length) {
    return <div className="flex items-center justify-center text-xs text-slate-300 italic" style={{ height }}>No data</div>;
  }
  const W = 640, H = height, padX = 8, padTop = 18, padBottom = 26;
  const plotW = W - padX * 2, plotH = H - padTop - padBottom;
  const max = Math.max(...series.map(s => s.value), 0) || 1;
  const n = series.length;
  const step = plotW / n;
  const x = i => padX + step * i + step / 2;
  const y = v => padTop + plotH - (Math.max(0, v) / max) * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {/* baseline */}
      <line x1={padX} y1={padTop + plotH} x2={W - padX} y2={padTop + plotH} stroke="#e2e8f0" strokeWidth="1" />

      {chartType === 'LINE' ? (
        <>
          <polyline
            points={series.map((s, i) => `${x(i)},${y(s.value)}`).join(' ')}
            fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
          />
          {series.map((s, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(s.value)} r="3.5" fill="#f59e0b" />
              <text x={x(i)} y={y(s.value) - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#475569">{fmtVal(s.value, unit)}</text>
            </g>
          ))}
        </>
      ) : (
        series.map((s, i) => {
          const bw = Math.min(step * 0.6, 40);
          const bx = x(i) - bw / 2;
          const by = y(s.value);
          return (
            <g key={i}>
              <rect x={bx} y={by} width={bw} height={padTop + plotH - by} rx="4" fill="#f59e0b" />
              <text x={x(i)} y={by - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#475569">{fmtVal(s.value, unit)}</text>
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
