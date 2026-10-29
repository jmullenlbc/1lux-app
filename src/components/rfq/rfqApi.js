// One fetch helper for the RFQs tab (0144). Returns the JSON, or { error } in
// plain words with a code at the end.
export async function rfqApi(path, { method = 'GET', body, what = 'That' } = {}) {
  const res = await fetch(path, {
    method,
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }).catch(() => null);
  if (!res) return { error: `${what} did not reach our server. Nothing was changed. Check the connection and try again. (RFQ_OFFLINE)` };
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { error: d?.error || `${what} did not go through; our server said ${res.status}. Nothing was changed. Try again. (RFQ_${res.status})` };
  return d;
}

export const money = (n) => (n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
