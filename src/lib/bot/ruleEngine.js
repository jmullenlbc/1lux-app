/**
 * ruleEngine.js — the generic "if-then" automation engine.
 *
 * Philosophy (Zapier-in-app):
 *   • PRIMITIVES are code — a registry of executors (draft email, schedule
 *     reminder, notify, …). These are the "apps."
 *   • WIRING is data — `BotRule` rows the sales team builds in the UI:
 *     WHEN <trigger> IF <conditions> THEN <action + config>. These are the "Zaps."
 *   • A baseline behavior (the method's own action) always runs; user rules
 *     layer additional conditional actions on top.
 *   • Every fire is written to `AutomationLog` so outcomes (accepted / edited /
 *     rejected) can be reviewed and the rules improved.
 *
 * Sources that can trigger rules: sales notes, emails, calendar events.
 */
import { prisma } from '@/lib/db';
import { executeNoteAction } from '@/lib/bot/executeNoteAction';
import { fillTemplate } from '@/lib/bot/mergeTokens';

// ── Trigger registry ─────────────────────────────────────────────────────────
// `fields` drives both the condition builder UI and the evaluator. `live`
// indicates whether the event source is wired yet (email/calendar arrive with
// Microsoft 365 sync).
export const TRIGGERS = {
  NOTE_ACTION_CONFIRMED: {
    label: 'A sales-note action is confirmed',
    source: 'Sales Notes',
    live: true,
    fields: [
      { key: 'method',      label: 'Method',        type: 'enum', options: ['EMAIL','TEXT','CALL','SCHEDULE','EXPECT_INTRO','SEND_MATERIALS','ADD_TO_LIST','INTERNAL_TASK','INTEL','OTHER'] },
      { key: 'typeLabel',   label: 'Type label',    type: 'string' },
      { key: 'contactName', label: 'Contact name',  type: 'string' },
      { key: 'company',     label: 'Company',       type: 'string' },
      { key: 'targetName',  label: 'Intro target',  type: 'string' },
      { key: 'hasContact',  label: 'Linked to CRM contact', type: 'bool' },
      { key: 'detail',      label: 'Detail text',   type: 'string' },
      { key: 'noteTitle',   label: 'Note title',    type: 'string' },
    ],
  },
  NOTE_PUBLISHED: {
    label: 'A sales note is published', source: 'Sales Notes', live: true,
    fields: [
      { key: 'noteTitle', label: 'Note title', type: 'string' },
      { key: 'activityType', label: 'Activity type', type: 'string' },
    ],
  },
  EMAIL_RECEIVED: {
    label: 'An email is received', source: 'Email', live: true, needsSync: true,
    fields: [
      { key: 'fromEmail', label: 'From',    type: 'string' },
      { key: 'fromDomain',label: 'From domain', type: 'string' },
      { key: 'subject',   label: 'Subject', type: 'string' },
      { key: 'body',      label: 'Body',    type: 'string' },
    ],
  },
  CALENDAR_EVENT_CREATED: {
    label: 'A calendar event is created', source: 'Calendar', live: true, needsSync: true,
    fields: [
      { key: 'title',        label: 'Title',         type: 'string' },
      { key: 'activityType', label: 'Activity type', type: 'string' },
      { key: 'attendeeCount',label: 'Attendee count',type: 'number' },
      { key: 'isInPerson',   label: 'In person',     type: 'bool' },
    ],
  },
};

// ── Condition evaluator ──────────────────────────────────────────────────────
// conditions: { match: 'all' | 'any', rules: [{ field, op, value }] }
const OPS = {
  eq:       (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase(),
  neq:      (a, b) => String(a ?? '').toLowerCase() !== String(b ?? '').toLowerCase(),
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  gt:       (a, b) => Number(a) >  Number(b),
  gte:      (a, b) => Number(a) >= Number(b),
  lt:       (a, b) => Number(a) <  Number(b),
  lte:      (a, b) => Number(a) <= Number(b),
  is_true:  (a)    => a === true || a === 'true',
  is_false: (a)    => a === false || a === 'false' || a == null,
  exists:   (a)    => a != null && a !== '',
};

export function evaluateConditions(conditions, payload) {
  const rules = conditions?.rules || [];
  if (rules.length === 0) return true; // no conditions → always matches
  const test = (r) => {
    const fn = OPS[r.op];
    if (!fn) return false;
    try { return fn(payload[r.field], r.value); } catch { return false; }
  };
  return (conditions.match === 'any') ? rules.some(test) : rules.every(test);
}

// ── Action primitive registry ────────────────────────────────────────────────
// Each executor: async (payload, actionConfig, ctx) => { botDraftId?, detail }
async function createFollowUpDraft({ ownerUserId, toEmail, toName, subject, body, reviewWindowMinutes }) {
  if (!ownerUserId) return null;
  return prisma.botDraft.create({
    data: {
      userId: ownerUserId, type: 'FOLLOW_UP', status: 'PENDING_REVIEW',
      toEmail: toEmail || '', toName: toName || null,
      subject: subject || 'Follow-up', body: body || '',
      reviewWindowMinutes: reviewWindowMinutes ?? 30,
    },
  });
}

export const ACTIONS = {
  DRAFT_EMAIL: {
    label: 'Draft an email (queue for review)',
    async run(payload, cfg, ctx) {
      const body = fillTemplate(cfg?.template || '', {
        firstName: (payload.contactName || '').split(' ')[0] || 'there',
        name:      payload.contactName || '',
        company:   payload.company || '',
        target:    payload.targetName || '',
      }) || payload.detail || '';
      const d = await createFollowUpDraft({
        ownerUserId: ctx.ownerUserId, toEmail: ctx.contact?.email, toName: payload.contactName,
        subject: cfg?.subject || `Follow-up — ${payload.contactName || ''}`.trim(), body,
        reviewWindowMinutes: ctx.reviewWindowMinutes,
      });
      return { botDraftId: d?.id, detail: 'email draft queued' };
    },
  },
  NOTIFY: {
    label: 'Notify the note owner',
    async run(payload, cfg, ctx) {
      const d = await createFollowUpDraft({
        ownerUserId: ctx.ownerUserId, toEmail: '', toName: payload.contactName,
        subject: cfg?.subject || `Heads up: ${payload.typeLabel || 'action'} — ${payload.contactName || ''}`.trim(),
        body: cfg?.message || payload.detail || payload.rawText || '',
        reviewWindowMinutes: ctx.reviewWindowMinutes,
      });
      return { botDraftId: d?.id, detail: 'notification queued' };
    },
  },
  SCHEDULE_REMINDER: {
    label: 'Schedule a reminder',
    async run(payload, cfg, ctx) {
      const days = Number(cfg?.days) || 7;
      if (ctx.noteActionId) {
        await prisma.noteAction.update({
          where: { id: ctx.noteActionId },
          data: { remindAt: new Date(Date.now() + days * 86400000) },
        });
      }
      return { detail: `reminder in ${days}d` };
    },
  },
  CREATE_TASK: {
    label: 'Create an internal task',
    async run(payload) { return { detail: `task: ${payload.detail || payload.rawText || ''}`.slice(0, 200) }; },
  },
  ADD_TO_LIST: {
    label: 'Add the contact to a list',
    async run(payload, cfg) { return { detail: `add ${payload.contactName || '?'} to ${cfg?.list || 'list'}` }; },
  },
};

// ── Baseline behavior per trigger (the method's own action) ──────────────────
async function runBaseline(triggerType, payload, ctx) {
  if (triggerType === 'NOTE_ACTION_CONFIRMED' && ctx.action && ctx.type) {
    const r = await executeNoteAction(ctx.action, ctx.type, {
      ownerUserId: ctx.ownerUserId, reviewWindowMinutes: ctx.reviewWindowMinutes,
    });
    return { botDraftId: r?.draftId, detail: r?.remindAt ? 'reminder scheduled' : (r?.draftId ? 'draft queued' : 'confirmed') };
  }
  return null;
}

async function log(entry) {
  try { await prisma.automationLog.create({ data: entry }); } catch (e) { console.error('[ruleEngine] log failed:', e?.message ?? e); }
}

/**
 * Fire a trigger: run the baseline behavior, then every matching user rule.
 * @param {string} triggerType
 * @param {object} payload  flat fields used for condition matching
 * @param {object} ctx      { ownerUserId, contact, reviewWindowMinutes, action, type, noteActionId, eventRef }
 * @returns {object} { baseline, fired: [...] }
 */
export async function runTrigger(triggerType, payload, ctx = {}) {
  // Dry run (Test panel / M365-less simulation): evaluate everything, mutate
  // nothing. Returns what WOULD happen so rules can be tested before they're live.
  if (ctx.dryRun) {
    let rules = [];
    try { rules = await prisma.botRule.findMany({ where: { isActive: true, triggerType } }); } catch {}
    const matched = [];
    for (const rule of rules) {
      let conditions = {}, action = {};
      try { conditions = JSON.parse(rule.triggerConfig || '{}').conditions || {}; } catch {}
      try { action = JSON.parse(rule.actionConfig || '{}'); } catch {}
      if (!evaluateConditions(conditions, payload)) continue;
      const exec = ACTIONS[rule.actionType];
      matched.push({
        ruleId: rule.id, ruleName: rule.name, actionType: rule.actionType,
        actionLabel: exec?.label || rule.actionType, known: !!exec, config: action,
      });
    }
    const baseline = (triggerType === 'NOTE_ACTION_CONFIRMED' && payload.method)
      ? { actionType: 'BASELINE', detail: `Run the ${payload.typeLabel || payload.method} method's baseline action` }
      : null;
    return { dryRun: true, triggerType, payload, baseline, matched, ruleCount: rules.length };
  }

  const result = { baseline: null, fired: [] };

  // 1) Baseline (method-defined) behavior.
  try {
    const base = await runBaseline(triggerType, payload, ctx);
    if (base) {
      result.baseline = base;
      await log({ triggerType, eventRef: ctx.eventRef || null, ruleId: null, ruleName: 'Baseline',
        actionType: 'BASELINE', matched: true, status: 'FIRED', detail: base.detail, botDraftId: base.botDraftId || null,
        outcome: base.botDraftId ? 'PENDING' : 'NA' });
    }
  } catch (e) {
    console.error('[ruleEngine] baseline failed:', e?.message ?? e);
    await log({ triggerType, eventRef: ctx.eventRef || null, actionType: 'BASELINE', status: 'ERROR', detail: String(e?.message ?? e).slice(0, 200), outcome: 'NA' });
  }

  // 2) User "if-then" rules.
  let rules = [];
  try {
    rules = await prisma.botRule.findMany({ where: { isActive: true, triggerType }, orderBy: { executionOrder: 'asc' } });
  } catch {}

  for (const rule of rules) {
    let conditions = {};
    let action = {};
    try { conditions = JSON.parse(rule.triggerConfig || '{}').conditions || {}; } catch {}
    try { action = JSON.parse(rule.actionConfig || '{}'); } catch {}

    if (!evaluateConditions(conditions, payload)) continue;

    const exec = ACTIONS[rule.actionType];
    if (!exec) {
      await log({ triggerType, eventRef: ctx.eventRef || null, ruleId: rule.id, ruleName: rule.name,
        actionType: rule.actionType, matched: true, status: 'SKIPPED', detail: 'unknown action type', outcome: 'NA' });
      continue;
    }
    try {
      const out = await exec.run(payload, action, ctx);
      await log({ triggerType, eventRef: ctx.eventRef || null, ruleId: rule.id, ruleName: rule.name,
        actionType: rule.actionType, matched: true, status: 'FIRED', detail: out?.detail || null,
        botDraftId: out?.botDraftId || null, outcome: out?.botDraftId ? 'PENDING' : 'NA' });
      result.fired.push({ ruleId: rule.id, actionType: rule.actionType, ...out });
    } catch (e) {
      await log({ triggerType, eventRef: ctx.eventRef || null, ruleId: rule.id, ruleName: rule.name,
        actionType: rule.actionType, matched: true, status: 'ERROR', detail: String(e?.message ?? e).slice(0, 200), outcome: 'NA' });
    }
  }

  return result;
}

// Record the human's verdict on a queued draft (the learning signal).
export async function recordDraftOutcome(botDraftId, outcome) {
  if (!botDraftId) return;
  try {
    await prisma.automationLog.updateMany({
      where: { botDraftId, outcome: { in: ['PENDING'] } },
      data: { outcome },
    });
  } catch (e) { console.error('[ruleEngine] recordDraftOutcome failed:', e?.message ?? e); }
}
