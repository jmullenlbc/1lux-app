/**
 * alerts.js — the one way anything in the app tells a human something.
 *
 * The bell in the sidebar reads `UserAlert`. Before this file, five places
 * wrote to that table directly with hand-rolled `prisma.userAlert.create`
 * calls, and `sendNotification` in notify.js wrote an INTERNAL audit row and
 * told nobody — the row existed, the human never heard. Everything that wants
 * to reach a person now comes through here.
 *
 * ── The dedupe trap ──
 * `UserAlert.dedupeKey` is `@unique` across the WHOLE table, not per user. So
 * two people cannot both be told about the same thing under the same key: the
 * first write wins and the second is silently dropped. Every key is therefore
 * namespaced with the recipient's id before it is stored, and callers should
 * pass the key that describes the EVENT, not the delivery. Get this wrong and
 * the failure is invisible — one person gets told, everyone else doesn't, and
 * nothing errors.
 *
 * ── Failure policy ──
 * Alerting is never the point of the request that triggers it. A failed alert
 * must not fail a budget save or a cron sweep, so everything here swallows and
 * logs. The return value says whether it landed, for callers that care.
 *
 * ── Why the database is imported lazily ──
 * Every function takes an optional `{ db }` so tests can drive it without a
 * database, matching how collectMetrics is written. That only buys anything if
 * the module can be LOADED without a database: `@/lib/db` is a bundler alias,
 * so a plain `node --test` cannot resolve it and the file would be untestable
 * no matter what its functions accept. Resolving it on first use instead of at
 * load keeps the real callers unchanged — they still pass nothing and still get
 * the real client — while leaving the module importable outside Next.
 */

let realDb = null;

async function defaultDb() {
  if (!realDb) ({ prisma: realDb } = await import('@/lib/db'));
  return realDb;
}

/**
 * Namespace a caller's event key to one recipient. See "The dedupe trap".
 * Exported for tests: this one line is the difference between everyone being
 * told and only the first person being told, and it fails silently.
 */
export function scopedKey(userId, dedupeKey) {
  return dedupeKey ? `${userId}::${dedupeKey}` : null;
}

/**
 * Tell one person one thing.
 *
 * @param {object}  a
 * @param {string}  a.userId     recipient
 * @param {string}  a.type       taxonomy key — a NOTIFICATION_TYPES key where one fits
 * @param {string}  a.title      one line, shown bold in the bell
 * @param {string} [a.message]   the detail line
 * @param {string} [a.link]      where clicking it should go
 * @param {string} [a.dedupeKey] describes the EVENT; repeat calls with the same
 *                               key are dropped, which is how a daily sweep can
 *                               run every day without nagging every day
 * @returns {Promise<{created: boolean, id?: string, reason?: string}>}
 */
export async function notifyUser({ userId, type, title, message = '', link = null, dedupeKey = null }, { db } = {}) {
  if (!userId || !title) return { created: false, reason: 'missing userId or title' };
  try {
    const client = db || await defaultDb();
    const alert = await client.userAlert.create({
      data: {
        userId,
        type:      type || 'GENERAL',
        title,
        message:   message || '',
        link:      link || null,
        dedupeKey: scopedKey(userId, dedupeKey),
      },
    });
    return { created: true, id: alert.id };
  } catch (err) {
    // P2002 = the unique dedupeKey already exists. That is the mechanism
    // working, not a fault: this person has already been told.
    if (err?.code === 'P2002') return { created: false, reason: 'duplicate' };
    console.error('[alerts] notifyUser failed:', err?.message ?? err);
    return { created: false, reason: 'error' };
  }
}

/**
 * Tell several people the same thing. One person failing must not stop the
 * others, so these run independently rather than in a transaction.
 */
export async function notifyUsers(userIds, alert, { db } = {}) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  const results = await Promise.all(unique.map(userId => notifyUser({ ...alert, userId }, { db })));
  return { sent: results.filter(r => r.created).length, skipped: results.filter(r => !r.created).length };
}

/**
 * Tell whoever owns a project. That is the sales owner and the pre-con manager
 * — the two people the schema says are accountable for it. If a project has
 * neither, nobody is told and the caller is told nobody was told, rather than
 * the alert evaporating.
 */
export async function notifyProjectOwners(projectId, alert, { db } = {}) {
  if (!projectId) return { sent: 0, skipped: 0 };
  try {
    const client = db || await defaultDb();
    const project = await client.project.findUnique({
      where:  { id: projectId },
      select: { salesOwnerId: true, preconManagerId: true },
    });
    if (!project) return { sent: 0, skipped: 0 };
    return notifyUsers([project.salesOwnerId, project.preconManagerId], alert, { db: client });
  } catch (err) {
    console.error('[alerts] notifyProjectOwners failed:', err?.message ?? err);
    return { sent: 0, skipped: 0 };
  }
}
