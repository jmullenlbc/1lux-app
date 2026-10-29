'use client';
import { useState } from 'react';

// Row checkboxes with Select all (the app's multi-select rule), shared by the
// RFQ line tables and the quote lines.
export const BOX = 'w-4 h-4 accent-orange-500 cursor-pointer align-middle';

export function usePicks(ids) {
  const [picked, setPicked] = useState(() => new Set());
  const live = new Set([...picked].filter((id) => ids.includes(id)));
  const all = ids.length > 0 && live.size === ids.length;
  return {
    picked: live,
    all,
    has: (id) => live.has(id),
    toggle: (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    toggleAll: () => setPicked(all ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
  };
}
