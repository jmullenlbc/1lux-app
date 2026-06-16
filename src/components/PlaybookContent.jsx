import { fillClientName } from '@/lib/playbookContent';

function Item({ item, clientName, depth }) {
  const hasChildren = item.children?.length > 0;
  return (
    <li>
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 shrink-0 rounded-full ${depth === 0 ? 'w-1.5 h-1.5 bg-slate-400' : 'w-1 h-1 bg-slate-300'}`} />
        <div className="flex-1 flex items-baseline justify-between gap-3">
          <span className={depth === 0 ? 'text-sm text-slate-800 leading-snug' : 'text-sm text-slate-600 leading-snug'}>
            {fillClientName(item.text, clientName)}
          </span>
          {item.meta && (
            <span className="shrink-0 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
              {item.meta}
            </span>
          )}
        </div>
      </div>
      {hasChildren && (
        <ul className="mt-1.5 ml-3.5 space-y-1.5 border-l border-slate-100 pl-3">
          {item.children.map((c, i) => <Item key={i} item={c} clientName={clientName} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

// Renders a Playbook "How We Work Together" content block (recursive list with
// optional durations). Shared by the Playbook tab and the public share page.
export default function PlaybookContent({ content, clientName }) {
  if (!content?.items?.length) return null;
  return (
    <div>
      {content.note && (
        <div className="mb-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          {content.note}
        </div>
      )}
      <ul className="space-y-2.5">
        {content.items.map((item, i) => <Item key={i} item={item} clientName={clientName} depth={0} />)}
      </ul>
    </div>
  );
}
