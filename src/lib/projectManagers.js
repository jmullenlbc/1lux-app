/**
 * The job's picked Project Managers, for anything that prints (Mike 2026-10-31).
 * Never falls back to whoever created the job. No DB import, so pages can use it.
 */
export const PM_SELECT = {
  where:   { isPm: true },
  orderBy: { createdAt: 'asc' },
  select:  { user: { select: { name: true, email: true } } },
};

export function pmPrint(assignees) {
  const users = (assignees || []).map(a => a.user).filter(Boolean);
  return {
    names:  users.map(u => u.name || u.email).filter(Boolean).join(', '),
    emails: users.map(u => u.email).filter(Boolean).join(', '),
  };
}
