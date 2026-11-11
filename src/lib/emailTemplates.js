/**
 * Email templates for all notification types.
 * Each function returns { subject, html }.
 *
 * NOTE: All templates are stubs, they produce correct structure with a
 * tracking pixel but no styled design. When Outlook/Graph API is connected
 * (NOTIFY_DRY_RUN=false), replace the html bodies with properly branded HTML.
 *
 * The pixelUrl is embedded in every email as a 1×1 transparent GIF so
 * ILC has a legal paper trail showing when the email was opened.
 */

// Whose name is on the email (2026-11-10): the job's company, from src/lib/brand.js (brandName below). Callers
// pass it; without one an email says 1LUX.
const DEFAULT_BRAND_NAME = '1LUX';
const escName = (s) => String(s || DEFAULT_BRAND_NAME).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function baseHtml({ title, projectName, body, pixelUrl, ctaUrl, ctaLabel, brandName }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f8f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#0a1929;padding:20px 32px;">
          <span style="color:#f97316;font-size:18px;font-weight:700;letter-spacing:-0.5px;">${escName(brandName)}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;color:#1e293b;">
          <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;">${title}</h2>
          ${projectName ? `<p style="margin:0 0 20px;font-size:13px;color:#64748b;">Project: ${projectName}</p>` : ''}
          <div style="font-size:14px;line-height:1.6;color:#334155;">${body}</div>
          ${ctaUrl ? `
          <div style="margin:28px 0 0;">
            <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">${ctaLabel || 'View Details'}</a>
          </div>` : ''}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            This notification was sent by ${escName(brandName)}. Reply to this email or contact your project manager with any questions.
          </p>
        </td></tr>
      </table>
      <!-- Tracking pixel -->
      ${pixelUrl ? `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />` : ''}
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Ship Schedule ─────────────────────────────────────────────────────────────

export function shipShipped({ projectName, manufacturer, trackingNumber, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] ${manufacturer} shipment is on its way`,
    html: baseHtml({ brandName,
      title: 'Shipment Shipped',
      projectName,
      pixelUrl,
      body: `<p>Your <strong>${manufacturer}</strong> order has shipped.</p>
             ${trackingNumber ? `<p>Tracking number: <strong>${trackingNumber}</strong></p>` : ''}
             <p>You can view the full ship schedule in your project portal.</p>`,
    }),
  };
}

export function shipDelivered({ projectName, manufacturer, deliveredDate, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const fmt = deliveredDate ? new Date(deliveredDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    subject: `[${brandName}] ${manufacturer} delivery confirmed`,
    html: baseHtml({ brandName,
      title: 'Shipment Delivered',
      projectName,
      pixelUrl,
      body: `<p>Your <strong>${manufacturer}</strong> order has been delivered${fmt ? ` on ${fmt}` : ''}.</p>`,
    }),
  };
}

export function shipEsdDigest({ projectName, events, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const rows = events.map(e => `<li>${e.manufacturer}: ESD updated to ${e.esdDate ? new Date(e.esdDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}</li>`).join('');
  return {
    subject: `[${brandName}] Ship schedule update : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Weekly Ship Schedule Digest',
      projectName,
      pixelUrl,
      body: `<ul>${rows}</ul>`,
    }),
  };
}

// ── Submittals ────────────────────────────────────────────────────────────────

export function submittalUploaded({ projectName, submissionName, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] New submittal : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'New Submittal Uploaded',
      projectName,
      pixelUrl,
      body: `<p>A new submittal package has been uploaded${submissionName ? `: <strong>${submissionName}</strong>` : ''}.</p>
             <p>Please log in to your project portal to review.</p>`,
    }),
  };
}

export function submittalWithComments({ projectName, submissionName, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] Submittal with comments : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Submittal Uploaded with Comments',
      projectName,
      pixelUrl,
      body: `<p>A submittal has been uploaded with reviewer comments${submissionName ? `: <strong>${submissionName}</strong>` : ''}.</p>
             <p>Please log in to your project portal to review the comments.</p>`,
    }),
  };
}

// ── Budgets ───────────────────────────────────────────────────────────────────

export function budgetSent({ projectName, budgetType, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const label = budgetType === 'design' ? 'Full Design Budget' : budgetType === 'peer_review' ? 'Peer Review' : 'Conceptual Budget';
  return {
    subject: `[${brandName}] ${label} sent : ${projectName}`,
    html: baseHtml({ brandName,
      title: `${label} Sent`,
      projectName,
      pixelUrl,
      body: `<p>Your ${label.toLowerCase()} has been sent. Please review and reach out with any questions.</p>`,
    }),
  };
}

export function budgetUpdated({ projectName, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] Budget updated : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Budget Updated',
      projectName,
      pixelUrl,
      body: `<p>The project budget has been updated. Please log in to your portal to review the latest figures.</p>`,
    }),
  };
}

// ── Contracts ─────────────────────────────────────────────────────────────────

export function contractUploaded({ projectName, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] Contract document uploaded : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Contract Uploaded',
      projectName,
      pixelUrl,
      body: `<p>A contract document has been uploaded to your project. Please log in to review.</p>`,
    }),
  };
}

export function contractSigned({ projectName, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] Contract signed : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Contract Signed',
      projectName,
      pixelUrl,
      body: `<p>The contract for <strong>${projectName}</strong> has been signed. We're ready to get started.</p>`,
    }),
  };
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export function meetingNote({ projectName, noteTitle, meetingDate, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const fmt = meetingDate ? new Date(meetingDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    subject: `[${brandName}] Meeting notes${fmt ? ` from ${fmt}` : ''} : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'New Meeting Notes Posted',
      projectName,
      pixelUrl,
      body: `<p>Meeting notes have been posted${noteTitle ? `: <strong>${noteTitle}</strong>` : ''}${fmt ? ` (${fmt})` : ''}.</p>
             <p>Log in to your project portal to read the full notes.</p>`,
    }),
  };
}

// ── Change Orders ─────────────────────────────────────────────────────────────

export function changeOrderNew({ projectName, fileName, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] New change order : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'New Change Order',
      projectName,
      pixelUrl,
      body: `<p>A new change order has been submitted${fileName ? `: <strong>${fileName}</strong>` : ''}. Please log in to review.</p>`,
    }),
  };
}

// ── COI Expiry ────────────────────────────────────────────────────────────────

export function coiExpiring({ projectName, expiryDate, daysOut, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const fmt = expiryDate ? new Date(expiryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return {
    subject: `[${brandName}] COI expiring soon : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Certificate of Insurance Expiring',
      projectName,
      pixelUrl,
      body: `<p>Your Certificate of Insurance${fmt ? ` expires on <strong>${fmt}</strong>` : ' is expiring soon'}${daysOut ? ` (${daysOut} day${daysOut !== 1 ? 's' : ''} away)` : ''}.</p>
             <p>Please provide a renewed COI to avoid any lapse in coverage.</p>`,
    }),
  };
}

// ── Construction Schedule Alert ───────────────────────────────────────────────

export function constructionDeadline({ projectName, milestone, date, daysOut, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const fmt = date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const urgency = daysOut <= 14 ? '⚠️ ' : '';
  return {
    subject: `[${brandName}] ${urgency}${milestone} in ${daysOut} day${daysOut !== 1 ? 's' : ''} : ${projectName}`,
    html: baseHtml({ brandName,
      title: `${urgency}${milestone} Upcoming`,
      projectName,
      pixelUrl,
      body: `<p><strong>${milestone}</strong>${fmt ? ` is scheduled for ${fmt}` : ' is approaching'}${daysOut != null ? `, ${daysOut} day${daysOut !== 1 ? 's' : ''} away` : ''}.</p>
             <p>Please ensure all deliverables are on track for this milestone.</p>`,
    }),
  };
}

// ── Digest (generic) ──────────────────────────────────────────────────────────

// ── Annual client review reminder ─────────────────────────────────────────────

export function clientAnnualReview({ ownerName, clientName, clientUrl, lastUpdated, brandName = DEFAULT_BRAND_NAME }) {
  const lastFmt = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'over a year ago';
  return {
    subject: `[${brandName}] Annual review reminder : ${clientName}`,
    html: baseHtml({ brandName,
      title: `Annual Standards & Playbook Review`,
      pixelUrl: null,
      ctaUrl: clientUrl,
      ctaLabel: 'Review Client →',
      body: `
        <p>Hi ${ownerName || 'team'},</p>
        <p>It's been a year since the standards and playbook for <strong>${clientName}</strong> were last reviewed (${lastFmt}). Please take a few minutes to verify the information is still current:</p>
        <ul style="padding-left:20px;margin:12px 0;">
          <li>Playbook: key contacts, approval process, GC routing</li>
          <li>Standards: fixture selections, CCT preferences, control preferences</li>
        </ul>
        <p style="font-size:13px;color:#64748b;">Keeping this information up to date ensures every team member is working from the right playbook.</p>
      `,
    }),
  };
}

function formatEventRow(e) {
  const p = (typeof e.payload === 'string')
    ? (() => { try { return JSON.parse(e.payload); } catch { return {}; } })()
    : (e.payload || {});
  switch (e.type) {
    case 'SHIP_ESD_UPDATE': {
      const d = p.esdDate ? new Date(p.esdDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
      return `ESD updated for <strong>${p.manufacturer || 'Unknown'}</strong> → ${d}`;
    }
    case 'SHIP_LEAD_TIME_UPDATE':
      return `Lead time updated for <strong>${p.manufacturer || 'Unknown'}</strong> → ${p.leadTimeWeeks || 'TBD'} weeks`;
    case 'SHIP_ESD_2WEEKS': {
      const d = p.esdDate ? new Date(p.esdDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
      return `<strong>${p.manufacturer || 'Unknown'}</strong> ESD within 2 weeks (${d})`;
    }
    default:
      return `${(e.type || '').replace(/_/g, ' ')}${p.manufacturer ? `: ${p.manufacturer}` : ''}`;
  }
}

// ── Portal Invite ─────────────────────────────────────────────────────────────

export function portalInvite({ projectName, inviteUrl, contactName, brandName = DEFAULT_BRAND_NAME }) {
  return {
    subject: `[${brandName}] You've been invited to view ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Project Portal Invitation',
      projectName,
      body: `<p>Hi${contactName ? ` ${contactName}` : ''},</p>
             <p>${escName(brandName)} has invited you to view real-time updates for <strong>${projectName}</strong> through the project portal.</p>
             <p>You'll have access to the information your project manager has shared with you, including ship schedules, meeting notes, submittals, and more.</p>`,
      ctaUrl:   inviteUrl,
      ctaLabel: 'Accept Invitation & Create Account',
    }),
  };
}

export function weeklyDigest({ projectName, events, pixelUrl, brandName = DEFAULT_BRAND_NAME }) {
  const rows = events.map(e => `<li style="margin-bottom:6px;">${formatEventRow(e)}</li>`).join('');
  return {
    subject: `[${brandName}] Weekly project update : ${projectName}`,
    html: baseHtml({ brandName,
      title: 'Weekly Project Update',
      projectName,
      pixelUrl,
      body: `<p>Here's your project activity from this week:</p><ul style="padding-left:20px;margin:12px 0;">${rows}</ul>`,
    }),
  };
}
