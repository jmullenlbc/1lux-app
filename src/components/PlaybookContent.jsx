import { fillClientName } from '@/lib/playbookContent';

function Badge({ children }) {
  return (
    <span className="shrink-0 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
      {children}
    </span>
  );
}

// A nested detail line inside a card (recursive for the rare 3rd level).
function Leaf({ item, clientName }) {
  const kids = item.children?.length > 0;
  return (
    <li>
      <div className="flex items-start gap-2">
        <span className="mt-[7px] shrink-0 w-1 h-1 rounded-full bg-slate-300" />
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm text-slate-600 leading-snug">{fillClientName(item.text, clientName)}</span>
          {item.meta && <Badge>{item.meta}</Badge>}
        </div>
      </div>
      {kids && (
        <ul className="mt-1.5 ml-3.5 space-y-1.5 border-l border-slate-100 pl-3">
          {item.children.map((c, i) => <Leaf key={i} item={c} clientName={clientName} />)}
        </ul>
      )}
    </li>
  );
}

// Renders a Playbook "How We Work Together" content block as tiles/cards
// (matching the Standards tab). Shared by the Playbook tab and the share page.
// Item shape: { text, meta?, body?, children? }.
export default function PlaybookContent({ content, clientName }) {
  if (!content?.items?.length) return null;
  return (
    <div>
      {content.note && (
        <div className="mb-3 max-w-2xl text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          {content.note}
        </div>
      )}
      <div className="space-y-3 max-w-2xl">
        {content.items.map((item, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h4 className="font-semibold text-slate-900 text-sm leading-snug">{fillClientName(item.text, clientName)}</h4>
              {item.meta && <Badge>{item.meta}</Badge>}
            </div>
            {item.body && (
              <p className="mt-1.5 text-sm text-slate-600 leading-snug">{fillClientName(item.body, clientName)}</p>
            )}
            {item.children?.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {item.children.map((c, j) => <Leaf key={j} item={c} clientName={clientName} />)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
