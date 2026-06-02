'use client';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Calculator, Ruler, FileText, ListChecks, Code2,
  CalendarDays, HelpCircle, Receipt, ClipboardCheck, Truck, FileDiff,
  CalendarClock, Users, Calendar, Mail, Pin, PinOff,
} from 'lucide-react';

// Map icon name string → Lucide component
const ICON_MAP = {
  LayoutDashboard, Calculator, Ruler, FileText, ListChecks, Code2,
  CalendarDays, HelpCircle, Receipt, ClipboardCheck, Truck, FileDiff,
  CalendarClock, Users, Calendar, Mail,
};

function NavIcon({ name, size = 15 }) {
  const Comp = ICON_MAP[name];
  if (!Comp) return <span className="w-[15px] h-[15px] inline-block" />;
  return <Comp size={size} />;
}

export default function ProjectSidebar({ config, activeTab, onTabChange, userId, badges = {} }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState(
    () => config.map(s => s.section)
  );

  // SSR-safe: read localStorage after mount only
  useEffect(() => {
    if (!userId) return;
    const stored = localStorage.getItem(`sidebar_collapsed_${userId}`);
    if (stored === 'true') setCollapsed(true);
  }, [userId]);

  function togglePin() {
    const next = !collapsed;
    setCollapsed(next);
    if (userId) localStorage.setItem(`sidebar_collapsed_${userId}`, String(next));
  }

  function toggleSection(section) {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  }

  // All items flat — for rail
  const allItems = config.flatMap(s => s.items);

  // ── Collapsed rail ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-11 shrink-0 bg-white border-r border-slate-200 self-start sticky top-0 min-h-screen flex flex-col items-center py-2 gap-1">
        {/* Unpin button */}
        <button
          onClick={togglePin}
          title="Pin sidebar"
          className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 mb-1"
        >
          <PinOff size={14} />
        </button>

        <div className="w-5 border-t border-slate-100 my-1" />

        {allItems.map(item => {
          const isActive = activeTab === item.id;
          const badge = badges[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={item.label}
              className={[
                'w-8 h-8 flex items-center justify-center rounded-md relative transition-colors',
                isActive
                  ? 'bg-amber-50 text-amber-600'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
              ].join(' ')}
            >
              <NavIcon name={item.icon} size={15} />
              {badge > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-500 border border-white" />
              )}
            </button>
          );
        })}
      </aside>
    );
  }

  // ── Expanded sidebar ────────────────────────────────────────────────────────
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200 self-start sticky top-0 min-h-screen overflow-y-auto">
      {/* Pin button in header area */}
      <div className="flex items-center justify-end px-3 pt-2 pb-0">
        <button
          onClick={togglePin}
          title="Collapse sidebar"
          className="w-7 h-7 flex items-center justify-center rounded-md text-amber-500 hover:bg-amber-50 transition-colors"
        >
          <Pin size={13} />
        </button>
      </div>

      <nav className="py-1">
        {config.map((section, si) => {
          const isExpanded = expandedSections.includes(section.section);
          return (
            <div key={section.section}>
              {si > 0 && <div className="mx-3 border-t border-slate-100 my-1.5" />}

              <button
                onClick={() => toggleSection(section.section)}
                className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-slate-50 transition-colors group"
              >
                <span className="text-slate-300 text-xs">{section.icon}</span>
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors">
                  {section.section}
                </span>
                <svg
                  className={`w-3 h-3 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="mt-0.5 mb-1">
                  {section.items.map(item => {
                    const isActive = activeTab === item.id;
                    const badge = badges[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={[
                          'w-full text-left px-4 py-2 text-sm transition-colors border-l-2 flex items-center gap-2',
                          isActive
                            ? 'border-amber-500 bg-amber-50 text-amber-700 font-semibold'
                            : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        ].join(' ')}
                      >
                        <span className={isActive ? 'text-amber-500' : 'text-slate-300'}>
                          <NavIcon name={item.icon} size={14} />
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
