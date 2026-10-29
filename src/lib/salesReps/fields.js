// Editable SalesRep fields (0144). Shared by the create and update routes.
export const REP_FIELDS = ['name', 'abbreviation', 'mainPhone', 'secondPhone', 'street', 'city', 'state', 'zip', 'notes', 'active'];

export function repData(body, fields = REP_FIELDS) {
  const data = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    if (f === 'active') { data.active = Boolean(body.active); continue; }
    const v = typeof body[f] === 'string' ? body[f].trim() : body[f];
    data[f] = v === '' || v == null ? null : String(v);
  }
  if ('name' in data && !data.name) delete data.name;
  return data;
}
