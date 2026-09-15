/**
 * Notification dispatcher — single entry point for all notification logic.
 *
 * All triggers call sendNotification() or queueDigestEvent().
 *
 * ── Two audiences, two channels ──
 * EXTERNAL means email to the client. That is STUBBED until Microsoft Outlook
 * is integrated, and there is no way around it — we cannot send mail we have no
 * mailbox for.
 *
 * INTERNAL means us. It used to mean only a `NotificationLog` row: an audit
 * trail nobody reads, written and forgotten, so every internal notification in
 * the app told precisely nobody. It now also rings the bell in the sidebar for
 * whoever owns the project. That channel needs no mailbox and works today,
 * which is why the internal half of the notification plan is not blocked behind
 * the Outlook integration.
 *
 * TODO (Outlook integration):
 *   Replace the stub in sendEmail() with Microsoft Graph API:
 *   POST https://graph.microsoft.com/v1.0/users/{ILC_GRAPH_MAILBOX}/sendMail
 *   Auth: MSAL client credentials (client_id, client_secret, tenant_id)
 *   Set NOTIFY_DRY_RUN=false in Amplify env vars when ready.
 */

import { prisma } from '@/lib/db';
import { notifyProjectOwners } from '@/lib/alerts';
import {
  shipShipped, shipDelivered,
  submittalUploaded, submittalWithComments,
  budgetSent, budgetUpdated,
  contractUploaded, contractSigned,
  meetingNote, changeOrderNew,
  coiExpiring, constructionDeadline,
  weeklyDigest,
} from '@/lib/emailTemplates';

// ── Email stub ────────────────────────────────────────────────────────────────

// For text a person typed that goes into an email body.
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// One email to one person, already written. Exported for the screens that send
// a document by hand (change order, ship schedule) — they used to call
// sendNotification() with an email in the wrong shape, so nothing went out.
export async function sendEmail({ to, subject, html }) {
  if (process.env.NOTIFY_DRY_RUN !== 'false') {
    console.log(`[NOTIFY DRY RUN] to=${to} subject="${subject}"`);
    return;
  }
  // TODO: Microsoft Graph API implementation
  // const { Client } = await import('@microsoft/microsoft-graph-client');
  // const client = Client.initWithMiddleware({ authProvider: getMsalProvider() });
  // await client.api(`/users/${process.env.ILC_GRAPH_MAILBOX}/sendMail`).post({ message: { ... } });
  console.warn('[NOTIFY] sendEmail called but no email provider is configured.');
}

// ── Template builder ──────────────────────────────────────────────────────────

function buildEmailFromType(type, payload, projectName, pixelUrl) {
  switch (type) {
    case 'SHIP_SHIPPED':
      return shipShipped({ projectName, manufacturer: payload.manufacturer, trackingNumber: payload.trackingNumber, pixelUrl });
    case 'SHIP_DELIVERED':
      return shipDelivered({ projectName, manufacturer: payload.manufacturer, deliveredDate: payload.deliveredDate, pixelUrl });
    case 'SUBMITTAL_UPLOADED':
      return submittalUploaded({ projectName, submissionName: payload.submissionName, pixelUrl });
    case 'SUBMITTAL_WITH_COMMENTS':
      return submittalWithComments({ projectName, submissionName: payload.submissionName, pixelUrl });
    case 'BUDGET_SENT':
      return budgetSent({ projectName, budgetType: payload.budgetType, pixelUrl });
    case 'BUDGET_UPDATED':
      return budgetUpdated({ projectName, pixelUrl });
    case 'CONTRACT_UPLOADED':
      return contractUploaded({ projectName, pixelUrl });
    case 'CONTRACT_SIGNED':
      return contractSigned({ projectName, pixelUrl });
    case 'MEETING_NOTE':
      return meetingNote({ projectName, noteTitle: payload.title, meetingDate: payload.meetingDate, pixelUrl });
    case 'CHANGE_ORDER_NEW':
      return changeOrderNew({ projectName, fileName: payload.fileName, pixelUrl });
    case 'COI_EXPIRING':
      return coiExpiring({ projectName, expiryDate: payload.expiryDate, daysOut: payload.daysOut, pixelUrl });
    case 'CONSCHED_3M':
    case 'CONSCHED_2M':
    case 'CONSCHED_1M':
    case 'CONSCHED_2W':
      return constructionDeadline({ projectName, milestone: payload.milestone, date: payload.date, daysOut: payload.daysOut, pixelUrl });
    default:
      return {
        subject: `[ILC Studios] Update — ${projectName}`,
        html: `<p>${type.replace(/_/g, ' ')}</p>`,
      };
  }
}

// ── Config helpers ─────────────────────────────────────────────────────────────

async function getConfig(projectId, notificationType) {
  return prisma.projectNotificationConfig.findUnique({
    where: { project_id_notificationType: { project_id: projectId, notificationType } },
  });
}

function parseEmails(raw) {
  if (!raw) return [];
  return raw.split(',').map(e => e.trim()).filter(e => e.includes('@'));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire an immediate (event-driven) notification.
 * Logs to NotificationLog whether or not email is enabled.
 * Optional dedupeKey: set on the internal log for threshold deduplication.
 */
export async function sendNotification(projectId, notificationType, payload = {}, { dedupeKey = null } = {}) {
  try {
    const [config, project] = await Promise.all([
      getConfig(projectId, notificationType),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);

    const projectName = project?.name || 'Your Project';
    const emails      = config?.enabled ? parseEmails(config.externalEmails) : [];
    const payloadStr  = JSON.stringify(payload);
    const appUrl      = process.env.APP_URL || '';

    for (const email of emails) {
      const log = await prisma.notificationLog.create({
        data: {
          project_id:       projectId,
          notificationType,
          audience:         'EXTERNAL',
          recipientEmail:   email,
          payload:          payloadStr,
        },
      });
      const pixelUrl      = `${appUrl}/api/notifications/opened/${log.openToken}`;
      const { subject, html } = buildEmailFromType(notificationType, payload, projectName, pixelUrl);
      await sendEmail({ to: email, subject, html });
    }

    // Always log internal record (used for audit trail + threshold deduplication)
    await prisma.notificationLog.create({
      data: {
        project_id:       projectId,
        notificationType,
        audience:         'INTERNAL',
        payload:          payloadStr,
        dedupeKey:        dedupeKey || null,
      },
    });

    // …and actually tell somebody. The audit row above is a record that the
    // event happened; this is the part where a human finds out. Deliberately
    // last and deliberately swallowed inside notifyProjectOwners: a bell that
    // cannot be rung must never fail the thing that rang it.
    const meta = NOTIFICATION_TYPES[notificationType];
    await notifyProjectOwners(projectId, {
      type:      notificationType,
      title:     `${meta?.label || notificationType} — ${projectName}`,
      message:   summarizePayload(payload),
      link:      `/project/${projectId}`,
      // Namespaced per project+type so the same event cannot ring twice, but
      // the SAME event for a different project still rings. Threshold callers
      // pass their own window-scoped key; everything else gets one per event.
      dedupeKey: dedupeKey || null,
    });
  } catch (err) {
    console.error('[NOTIFY] sendNotification failed:', err);
  }
}

/**
 * Turn a payload into one readable line for the bell. Payload shapes differ per
 * notification type, so this leans on the few keys that recur rather than
 * pretending to understand all of them; an unrecognised payload produces an
 * empty message and the title still carries the meaning.
 */
function summarizePayload(payload = {}) {
  const bits = [];
  if (payload.milestone)  bits.push(String(payload.milestone));
  if (payload.date)       bits.push(String(payload.date));
  if (payload.expiryDate) bits.push(`expires ${payload.expiryDate}`);
  if (typeof payload.daysOut === 'number') bits.push(`${payload.daysOut} days out`);
  if (payload.itemName)   bits.push(String(payload.itemName));
  if (payload.note)       bits.push(String(payload.note));
  return bits.join(' · ').slice(0, 400);
}

/**
 * Queue an event for the Wednesday digest.
 * Does NOT send immediately.
 */
export async function queueDigestEvent(projectId, notificationType, payload = {}) {
  try {
    const config = await getConfig(projectId, notificationType);
    if (!config?.enabled) return;
    const emails     = parseEmails(config.externalEmails);
    const payloadStr = JSON.stringify(payload);

    for (const email of emails) {
      await prisma.notificationQueue.create({
        data: { project_id: projectId, notificationType, audience: 'EXTERNAL', recipientEmail: email, payload: payloadStr },
      });
    }
  } catch (err) {
    console.error('[NOTIFY] queueDigestEvent failed:', err);
  }
}

/**
 * Fire a threshold notification — deduplicates by dedupeKey.
 * dedupeKey must be unique per project+type+time-window.
 * Example: `${projectId}:CONSCHED_1M:constructionEndDate:2026-05`
 */
export async function sendThresholdNotification(projectId, notificationType, dedupeKey, payload = {}) {
  try {
    const existing = await prisma.notificationLog.findFirst({ where: { dedupeKey } });
    if (existing) return; // already fired this threshold window

    // Pass dedupeKey through so the internal log is stamped on creation
    await sendNotification(projectId, notificationType, payload, { dedupeKey });
  } catch (err) {
    console.error('[NOTIFY] sendThresholdNotification failed:', err);
  }
}

// ── Notification type constants ────────────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  // Ship Schedule
  SHIP_ESD_UPDATE:      { label: 'ESD updated',               pattern: 'DIGEST',    external: true },
  SHIP_LEAD_TIME_UPDATE:{ label: 'Lead time updated',          pattern: 'DIGEST',    external: true },
  SHIP_ESD_2WEEKS:      { label: 'ESD in 2 weeks or less',    pattern: 'DIGEST',    external: true },
  SHIP_SHIPPED:         { label: 'Item shipped',              pattern: 'EVENT',     external: true },
  SHIP_DELIVERED:       { label: 'Item delivered',            pattern: 'EVENT',     external: true },
  // Submittals
  SUBMITTAL_UPLOADED:       { label: 'New submittal uploaded',       pattern: 'EVENT',  external: true },
  SUBMITTAL_WITH_COMMENTS:  { label: 'Submittal with comments',      pattern: 'EVENT',  external: true },
  SUBMITTAL_APPROVED:       { label: 'Item approved',                pattern: 'DIGEST', external: true },
  SUBMITTAL_REJECTED:       { label: 'Item rejected',                pattern: 'DIGEST', external: true },
  SUBMITTAL_STALE_60D:      { label: 'Item not approved after 60d',  pattern: 'DIGEST', external: true },
  SUBMITTAL_STALE_30D:      { label: 'Still not approved (+30d)',    pattern: 'DIGEST', external: true },
  // Budgets
  BUDGET_SENT:    { label: 'Budget sent',                   pattern: 'EVENT',     external: true },
  BUDGET_UPDATED: { label: 'Budget updated',                pattern: 'EVENT',     external: true },
  BUDGET_20PCT:   { label: 'Budget 20%+ higher than prev',  pattern: 'THRESHOLD', external: false },
  // Files / Drawings
  DRAWINGS_UPLOADED:        { label: 'New drawings uploaded',    pattern: 'EVENT', external: false },
  SUBMITTAL_FILE_UPLOADED:  { label: 'Submittal file uploaded',  pattern: 'EVENT', external: true },
  CONTRACT_UPLOADED:        { label: 'New contract uploaded',    pattern: 'EVENT', external: false },
  CONTRACT_SIGNED:          { label: 'Contract signed',          pattern: 'EVENT', external: true },
  // Meetings
  MEETING_NOTE: { label: 'New meeting note', pattern: 'EVENT', external: true },
  // Change Orders
  CHANGE_ORDER_NEW: { label: 'New change order', pattern: 'EVENT', external: true },
  // Contracts
  COI_EXPIRING: { label: 'COI expiring in 1 month', pattern: 'THRESHOLD', external: true },
  // Construction Schedule
  CONSCHED_3M: { label: 'Deadline in 3 months', pattern: 'THRESHOLD', external: true },
  CONSCHED_2M: { label: 'Deadline in 2 months', pattern: 'THRESHOLD', external: true },
  CONSCHED_1M: { label: 'Deadline in 1 month',  pattern: 'THRESHOLD', external: true },
  CONSCHED_2W: { label: 'Deadline in 2 weeks',  pattern: 'THRESHOLD', external: true },
  // Design
  DESIGN_SCHEDULE_UPLOADED: { label: 'Design schedule uploaded',   pattern: 'EVENT',     external: false },
  DESIGN_DEADLINE_1M:       { label: 'Design deadline in 1 month', pattern: 'THRESHOLD', external: false },
  DESIGN_DEADLINE_2W:       { label: 'Design deadline in 2 weeks', pattern: 'THRESHOLD', external: false },
  DESIGN_DEADLINE_1W:       { label: 'Design deadline in 1 week',  pattern: 'THRESHOLD', external: false },
  // CRM
  CRM_CLOSE_DATE: { label: 'Project close date in 1 month', pattern: 'THRESHOLD', external: false },
  // Warehousing
  WAREHOUSE_RELEASED: { label: 'Item released from warehouse', pattern: 'EVENT', external: true },
  // Misc
  FIXTURE_SCHEDULE_SUBMITTED: { label: 'Fixture schedule submitted', pattern: 'EVENT', external: false },
  TAKEOFF_READY:              { label: 'New takeoff ready',          pattern: 'EVENT', external: false },
  PROPOSAL_SENT:              { label: 'Proposal sent',             pattern: 'EVENT', external: false },
};

// Grouped by module for the settings UI
export const NOTIFICATION_MODULES = [
  { module: 'Ship Schedule',     keys: ['SHIP_ESD_UPDATE','SHIP_LEAD_TIME_UPDATE','SHIP_ESD_2WEEKS','SHIP_SHIPPED','SHIP_DELIVERED'] },
  { module: 'Submittals',        keys: ['SUBMITTAL_UPLOADED','SUBMITTAL_WITH_COMMENTS','SUBMITTAL_APPROVED','SUBMITTAL_REJECTED','SUBMITTAL_STALE_60D','SUBMITTAL_STALE_30D'] },
  { module: 'Budgets',           keys: ['BUDGET_SENT','BUDGET_UPDATED','BUDGET_20PCT'] },
  { module: 'Drawings',          keys: ['DRAWINGS_UPLOADED'] },
  { module: 'Contracts',         keys: ['CONTRACT_UPLOADED','CONTRACT_SIGNED','COI_EXPIRING'] },
  { module: 'Change Orders',     keys: ['CHANGE_ORDER_NEW'] },
  { module: 'Meetings',          keys: ['MEETING_NOTE'] },
  { module: 'Construction Sched',keys: ['CONSCHED_3M','CONSCHED_2M','CONSCHED_1M','CONSCHED_2W'] },
  { module: 'Design Info',       keys: ['DESIGN_SCHEDULE_UPLOADED','DESIGN_DEADLINE_1M','DESIGN_DEADLINE_2W','DESIGN_DEADLINE_1W'] },
  { module: 'Warehousing',       keys: ['WAREHOUSE_RELEASED'] },
  { module: 'CRM',               keys: ['CRM_CLOSE_DATE'] },
  { module: 'Other',             keys: ['FIXTURE_SCHEDULE_SUBMITTED','TAKEOFF_READY','PROPOSAL_SENT'] },
];
