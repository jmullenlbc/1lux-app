/**
 * Notification dispatcher, single entry point for all notification logic.
 *
 * All triggers call sendNotification() or queueDigestEvent().
 *
 * ── Two audiences, two channels ──
 * EXTERNAL means email to the client. That is STUBBED until Microsoft Outlook
 * is integrated, and there is no way around it, we cannot send mail we have no
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
import { NOTIFICATION_TYPES } from '@/lib/notificationTypes';
import { brandForProject } from '@/lib/brandServer';
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
// a document by hand (change order, ship schedule), they used to call
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

function buildEmailFromType(type, payload, projectName, pixelUrl, brandName) {
  switch (type) {
    case 'SHIP_SHIPPED':
      return shipShipped({ projectName, manufacturer: payload.manufacturer, trackingNumber: payload.trackingNumber, pixelUrl, brandName });
    case 'SHIP_DELIVERED':
      return shipDelivered({ projectName, manufacturer: payload.manufacturer, deliveredDate: payload.deliveredDate, pixelUrl, brandName });
    case 'SUBMITTAL_UPLOADED':
      return submittalUploaded({ projectName, submissionName: payload.submissionName, pixelUrl, brandName });
    case 'SUBMITTAL_WITH_COMMENTS':
      return submittalWithComments({ projectName, submissionName: payload.submissionName, pixelUrl, brandName });
    case 'BUDGET_SENT':
      return budgetSent({ projectName, budgetType: payload.budgetType, pixelUrl, brandName });
    case 'BUDGET_UPDATED':
      return budgetUpdated({ projectName, pixelUrl, brandName });
    case 'CONTRACT_UPLOADED':
      return contractUploaded({ projectName, pixelUrl, brandName });
    case 'CONTRACT_SIGNED':
      return contractSigned({ projectName, pixelUrl, brandName });
    case 'MEETING_NOTE':
      return meetingNote({ projectName, noteTitle: payload.title, meetingDate: payload.meetingDate, pixelUrl, brandName });
    case 'CHANGE_ORDER_NEW':
      return changeOrderNew({ projectName, fileName: payload.fileName, pixelUrl, brandName });
    case 'COI_EXPIRING':
      return coiExpiring({ projectName, expiryDate: payload.expiryDate, daysOut: payload.daysOut, pixelUrl, brandName });
    case 'CONSCHED_3M':
    case 'CONSCHED_2M':
    case 'CONSCHED_1M':
    case 'CONSCHED_2W':
      return constructionDeadline({ projectName, milestone: payload.milestone, date: payload.date, daysOut: payload.daysOut, pixelUrl, brandName });
    default:
      return {
        subject: `[${brandName || '1LUX'}] Update: ${projectName}`,
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
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, businessUnitId: true } }),
    ]);

    const projectName = project?.name || 'Your Project';
    // The job's company names the email (2026-11-10); none = 1LUX.
    const brandName   = (await brandForProject(project || projectId)).name;
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
      const { subject, html } = buildEmailFromType(notificationType, payload, projectName, pixelUrl, brandName);
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
      title:     `${meta?.label || notificationType}: ${projectName}`,
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
 * Fire a threshold notification, deduplicates by dedupeKey.
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


// Kept here so server code that imports them from notify.js still works.
export { NOTIFICATION_TYPES, NOTIFICATION_MODULES } from '@/lib/notificationTypes';
