/**
 * After an upload: does this file need a schedule read, and if so run it.
 *
 * The upload route stopped reading schedules inline (it ran past Amplify's
 * front door on a real P6 export). The row comes back at once; this asks
 * files/[fileId]/reparse for the milestones through park-and-poll and hands
 * back the same `{ file, scheduleUpdate, designScheduleUpdate }` the upload
 * response used to carry, so the screens that consume it did not change.
 *
 * Mirrors scheduleKindOf() in the reparse route: Design Schedule on Design
 * Info, Construction Schedule on CA.
 */
import { postParked } from './parkedFetch';

export function needsScheduleRead(file) {
  let tags = [];
  try { tags = JSON.parse(file?.tags || '[]'); } catch { tags = []; }
  if (!Array.isArray(tags)) return false;
  if (file?.tab === 'designInfo' && tags.includes('Design Schedule')) return true;
  if (file?.tab === 'ca' && tags.includes('Construction Schedule')) return true;
  return false;
}

/**
 * @param {string} projectId
 * @param {{ file: object, contractUpdate?: object|null, scheduleUpdate?: object|null, designScheduleUpdate?: object|null }} data
 *        the upload response
 * @returns the same object, with the schedule fields filled in when a read ran
 */
export async function afterUploadReads(projectId, data, { onWait } = {}) {
  const file = data?.file;
  if (!file?.id || !needsScheduleRead(file)) return data;
  // Already read (an older server, or a re-upload that carried its milestones).
  if (data.scheduleUpdate?.milestones?.length || data.designScheduleUpdate?.milestones?.length) return data;

  let out;
  try {
    const res = await postParked(`/api/projects/${projectId}/files/${file.id}/reparse`, {}, { onWait });
    out = await res.json();
  } catch {
    return data;   // the row is saved; the card's own auto-read will try again
  }
  if (!out?.milestones?.length) return data;

  return {
    ...data,
    file: { ...file, takeoffData: JSON.stringify({ milestones: out.milestones }) },
    scheduleUpdate:       out.scheduleUpdate       ?? data.scheduleUpdate       ?? null,
    designScheduleUpdate: out.designScheduleUpdate ?? data.designScheduleUpdate ?? null,
  };
}
