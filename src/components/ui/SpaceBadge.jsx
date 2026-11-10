import { spaceOf } from '@/lib/companySpaces';

// Colors per company, here rather than in src/lib/companySpaces.js because Tailwind only scans src/app and
// src/components for class names.
const TONE = {
  LOGIQ: 'bg-sky-100 text-sky-800 ring-sky-200',
  SAGE:  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  SHIFT: 'bg-violet-100 text-violet-800 ring-violet-200',
};

// The 1LUX company a job belongs to (LOGIQ, SAGE or Shift), as a small pill. Nothing when no company is set.
export default function SpaceBadge({ businessUnitId, className = '' }) {
  const space = spaceOf(businessUnitId);
  if (!space) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE[space.code]} ${className}`}>
      {space.label}
    </span>
  );
}
