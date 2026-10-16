'use client';
import { useEffect } from 'react';

/**
 * Mike 10-15: the budget on the right moves as soon as a choice changes,
 * before Next is pressed. Each wizard section hands its unsaved answers up
 * through `onLiveAnswers(section, answers)`; the wizard client lays them over
 * the saved answers for the live budget only. Nothing is written until Next.
 * Leaving the screen clears the overlay (null) so a stale draft never lingers.
 */
export function useLiveAnswers(onLiveAnswers, section, answers) {
  useEffect(() => {
    onLiveAnswers?.(section, answers);
  }, [onLiveAnswers, section, answers]);
  useEffect(() => () => onLiveAnswers?.(section, null), [onLiveAnswers, section]);
}

/** Lay unsaved answers over the saved ones, section by section. */
export function mergeLiveSections(sections, live) {
  const merged = { ...(sections || {}) };
  for (const [sec, vals] of Object.entries(live || {})) {
    if (sec === '__pd' || !vals || typeof vals !== 'object') continue;
    merged[sec] = { ...(merged[sec] || {}), ...vals };
  }
  return merged;
}

/**
 * Project Info form values are strings (and the percent boxes are whole
 * percents). Turn the typed values into the numbers the engine reads, the
 * same way the save path does. Blank stays blank (null) so "blank = estimated"
 * keeps working on the live budget.
 */
export function liveProjectData(form, pctFields) {
  const out = {};
  for (const [k, v] of Object.entries(form || {})) {
    if (v === '' || v == null) { out[k] = null; continue; }
    const num = parseFloat(v);
    if (isNaN(num) || !isFinite(num)) continue;
    out[k] = pctFields?.has(k) ? num / 100 : num;
  }
  return out;
}
