// "Useful" / "Don't need" on a notification, and the three-strikes rule.
//
// Mike, 2026-09-14: "Every alert gets two buttons, Useful and Don't need, and
// each click is saved. If someone clicks 'Don't need' on the same kind of alert
// three times, the app asks whether to stop sending it. Admins get a report
// showing which alerts people find useful and which are noise."
//
// The counting and the wording live here, away from the route, so a test can
// drive them without a database. No `@/` imports for the same reason.

export const VERDICTS = ['USEFUL', 'NOT_USEFUL'];

// Three "Don't need" clicks on the same kind, from the same person, and we ask.
export const STRIKES_BEFORE_ASKING = 3;

export function isVerdict(v) {
  return VERDICTS.includes(v);
}

/**
 * Should we ask this person whether to stop sending this kind of alert?
 * Only on the click that reaches the threshold, and never once it is muted —
 * asking again every click would be its own kind of nagging.
 */
export function shouldOfferMute({ notUsefulCount, alreadyMuted }) {
  if (alreadyMuted) return false;
  return notUsefulCount >= STRIKES_BEFORE_ASKING;
}

/** The sentence shown when we ask. */
export function muteQuestion(typeLabel) {
  return `That's ${STRIKES_BEFORE_ASKING} times you've said you don't need "${typeLabel}". Stop sending it to you?`;
}

/**
 * Roll feedback rows up per alert kind for the admin report.
 *
 * Rows in: `{ alertType, verdict }`, plus the mute rows `{ alertType }`.
 * Out: one row per kind, noisiest first — "noisiest" meaning the highest share
 * of "Don't need", with the count breaking ties so one grumpy click doesn't
 * top a list above a kind fifty people called noise.
 */
export function summarizeFeedback(rows = [], mutes = []) {
  const byType = new Map();
  for (const r of rows) {
    if (!r?.alertType) continue;
    const t = byType.get(r.alertType) || { alertType: r.alertType, useful: 0, notUseful: 0, mutedBy: 0 };
    if (r.verdict === 'USEFUL') t.useful += 1;
    else if (r.verdict === 'NOT_USEFUL') t.notUseful += 1;
    byType.set(r.alertType, t);
  }
  for (const m of mutes) {
    if (!m?.alertType) continue;
    const t = byType.get(m.alertType) || { alertType: m.alertType, useful: 0, notUseful: 0, mutedBy: 0 };
    t.mutedBy += 1;
    byType.set(m.alertType, t);
  }

  return [...byType.values()]
    .map(t => {
      const total = t.useful + t.notUseful;
      return { ...t, total, noisePct: total ? Math.round((t.notUseful / total) * 100) : 0 };
    })
    .sort((a, b) => (b.noisePct - a.noisePct) || (b.notUseful - a.notUseful) || a.alertType.localeCompare(b.alertType));
}

/** One plain line under each row of the report. */
export function describeNoise(row) {
  if (row.total === 0) return `Nobody has rated this one. ${row.mutedBy} turned it off.`;
  if (row.noisePct >= 60) return `Mostly noise — ${row.notUseful} of ${row.total} said they don't need it.`;
  if (row.noisePct <= 20) return `People want this one — ${row.useful} of ${row.total} called it useful.`;
  return `Mixed — ${row.useful} useful, ${row.notUseful} not needed.`;
}
