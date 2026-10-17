// ── Note action taxonomy (method-based) ───────────────────────────────────────
// The "type" of an action item names WHAT THE BOT DOES (its executor), so the bot
// knows how to act. These are the SEED defaults, the live taxonomy is stored in
// the NoteActionType table and managed by an admin (templates + instructions are
// blank to start and filled in by the admin). kind:'INTEL' items are facts.

export const DEFAULT_ACTION_TYPES = [
  { key: 'EMAIL',          label: 'Email',                    executor: 'EMAIL',          kind: 'ACTION', sortOrder: 10, reminderDays: null, description: 'Send an email to the contact.' },
  { key: 'TEXT',           label: 'Text',                     executor: 'TEXT',           kind: 'ACTION', sortOrder: 20, reminderDays: null, description: 'Send a text message to the contact.' },
  { key: 'CALL',           label: 'Call',                     executor: 'CALL',           kind: 'ACTION', sortOrder: 30, reminderDays: null, description: 'Call the contact (reminder/task).' },
  { key: 'SCHEDULE',       label: 'Schedule an event',        executor: 'SCHEDULE',       kind: 'ACTION', sortOrder: 40, reminderDays: null, description: 'Set up a coffee/lunch/golf/meeting (calendar).' },
  { key: 'EXPECT_INTRO',   label: 'Expect intro (email/text)', executor: 'EXPECT_INTRO',  kind: 'ACTION', sortOrder: 50, reminderDays: 7,    reminder2Days: 14, reminder3Days: 30, description: 'Someone is introducing me. Wait, then remind if it hasn’t happened.' },
  { key: 'EXPECT_REPLY',   label: 'Expect a reply',           executor: 'EXPECT_REPLY',   kind: 'ACTION', sortOrder: 52, reminderDays: 14,   reminder2Days: 30, reminder3Days: 60, description: 'They said they would get back to me. Watch email for their reply, remind if it does not come.' },
  { key: 'EXPECT_DRAWINGS', label: 'Expect drawings / files', executor: 'EXPECT_FILES',   kind: 'ACTION', sortOrder: 54, reminderDays: 14,   reminder2Days: 30, reminder3Days: 60, description: 'They are sending drawings, plans or files. Watch email for them, remind if they do not come.' },
  { key: 'EXPECT_INVITE',  label: 'Expect an invite',         executor: 'EXPECT_INVITE',  kind: 'ACTION', sortOrder: 56, reminderDays: 14,   reminder2Days: 30, reminder3Days: 60, description: 'They are sending a meeting or calendar invite. Watch for it, remind if it does not come.' },
  { key: 'SEND_MATERIALS', label: 'Send materials',           executor: 'SEND_MATERIALS', kind: 'ACTION', sortOrder: 60, reminderDays: null, description: 'Send a deck / DocSend link / pricing to the contact.' },
  { key: 'ADD_TO_LIST',    label: 'Add to list',              executor: 'ADD_TO_LIST',    kind: 'ACTION', sortOrder: 70, reminderDays: null, description: 'Add the contact to a distribution list (e.g. golf league).' },
  { key: 'INTERNAL_TASK',  label: 'Internal task',            executor: 'INTERNAL_TASK',  kind: 'ACTION', sortOrder: 80, reminderDays: null, description: 'A to-do for the ILC team (not outbound to the contact).' },
  { key: 'REMIND_ME',      label: 'Remind me',                executor: 'REMINDER',       kind: 'ACTION', sortOrder: 85, reminderDays: null, description: 'A reminder for me to do something later.' },
  { key: 'INTEL',          label: 'Intel (fact)',             executor: 'INTEL',          kind: 'INTEL',  sortOrder: 90, reminderDays: null, description: 'A fact about a person or company, NOT a to-do.' },
  { key: 'OTHER',          label: 'Other',                    executor: 'OTHER',          kind: 'ACTION', sortOrder: 99, reminderDays: null, description: 'Anything that doesn’t fit another type.' },
];

// Executors that send a message → they get an editable template.
export const TEMPLATE_EXECUTORS = new Set(['EMAIL', 'TEXT', 'SEND_MATERIALS']);

export const EXECUTORS = [
  'EMAIL', 'TEXT', 'CALL', 'SCHEDULE', 'EXPECT_INTRO', 'EXPECT_REPLY', 'EXPECT_FILES', 'EXPECT_INVITE',
  'SEND_MATERIALS', 'ADD_TO_LIST', 'INTERNAL_TASK', 'REMINDER', 'INTEL', 'OTHER',
];
