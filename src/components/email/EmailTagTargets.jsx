'use client';
import { useCallback, useEffect, useState } from 'react';

// Email tags as drop targets (0118). Drag an email row onto a tag to tag it.
//
// Usage:
//   1. Make the email row draggable:
//        <div draggable onDragStart={e => e.dataTransfer.setData(EMAIL_MESSAGE_DRAG_TYPE, message.id)}>
//      (or call startEmailDrag(e, message.id)).
//   2. Render <EmailTagTargets selectedMessageId={id} onTagged={(messageId, tag) => ...} />
//      near the list. A drop posts the tag. Clicking a tag tags the selected
//      message (the click fallback for phones, where there is no drag).
//
// The tag list comes from GET /api/email/tags.

export const EMAIL_MESSAGE_DRAG_TYPE = 'text/email-message-id';

export function startEmailDrag(e, messageId) {
  e.dataTransfer.setData(EMAIL_MESSAGE_DRAG_TYPE, messageId);
  e.dataTransfer.setData('text/plain', messageId);
  e.dataTransfer.effectAllowed = 'link';
}

export async function tagEmailMessage(messageId, tagKey) {
  const res = await fetch(`/api/email/messages/${messageId}/tags`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagKey }),
  }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(d?.error || (res ? 'Could not tag it.' : 'No signal. Try again in a moment.'));
  return d.messageTag;
}

export async function untagEmailMessage(messageId, tagKey) {
  const res = await fetch(`/api/email/messages/${messageId}/tags/${encodeURIComponent(tagKey)}`, { method: 'DELETE' }).catch(() => null);
  if (!res?.ok) throw new Error('Could not remove the tag.');
}

export function useEmailTags() {
  const [tags, setTags] = useState([]);
  useEffect(() => {
    let on = true;
    fetch('/api/email/tags').then(r => r.ok ? r.json() : { tags: [] }).then(d => { if (on) setTags(d.tags || []); }).catch(() => {});
    return () => { on = false; };
  }, []);
  return tags;
}

export default function EmailTagTargets({ selectedMessageId = null, onTagged, className = '' }) {
  const tags = useEmailTags();
  const [over, setOver] = useState(null);
  const [note, setNote] = useState('');

  const apply = useCallback(async (messageId, tag) => {
    if (!messageId) { setNote('Pick an email first, then click a tag.'); return; }
    try {
      await tagEmailMessage(messageId, tag.key);
      setNote(`Tagged ${tag.label}.`);
      onTagged?.(messageId, tag);
    } catch (e) { setNote(e.message); }
  }, [onTagged]);

  if (!tags.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">Drop on a tag</span>
      {tags.map(tag => (
        <button
          key={tag.key}
          type="button"
          title={`Drop an email here, or click to tag the open email as ${tag.label}`}
          onClick={() => apply(selectedMessageId, tag)}
          onDragOver={e => { if (e.dataTransfer.types.includes(EMAIL_MESSAGE_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; setOver(tag.key); } }}
          onDragLeave={() => setOver(o => (o === tag.key ? null : o))}
          onDrop={e => {
            e.preventDefault();
            setOver(null);
            const id = e.dataTransfer.getData(EMAIL_MESSAGE_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
            if (id) apply(id, tag);
          }}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${over === tag.key ? 'ring-2 ring-offset-1' : ''}`}
          style={{ borderColor: tag.color || '#cbd5e1', color: tag.color || '#475569', background: over === tag.key ? `${tag.color || '#94a3b8'}22` : 'white' }}
        >
          {tag.label}
        </button>
      ))}
      {note && <span className="text-[11px] text-slate-500 ml-1">{note}</span>}
    </div>
  );
}
