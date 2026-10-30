'use client';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Calculator, Ruler, FileText, ListChecks, Code2,
  CalendarDays, HelpCircle, Receipt, ClipboardCheck, Truck, FileDiff,
  CalendarClock, Users, Calendar, Mail, Lightbulb, Pin, PinOff, Scale, FileSignature,
} from 'lucide-react';

// Map icon name string → Lucide component
const ICON_MAP = {
  LayoutDashboard, Calculator, Ruler, FileText, ListChecks, Code2,
  CalendarDays, HelpCircle, Receipt, ClipboardCheck, Truck, FileDiff,
  CalendarClock, Users, Calendar, Mail, Lightbulb, Scale, FileSignature,
};

function NavIcon({ name, size = 15 }) {
  const Comp = ICON_MAP[name];
  if (!Comp) return <span className="w-[15px] h-[15px] inline-block" />;
  return <Comp size={size} />;
}

// drawer: the phone slide-out (Mike 10-29). Same folding sections, bigger
// rows, no pin; the desktop menu hides under md.
export default function ProjectSidebar({ config, activeTab, onTabChange, userId, badges = {}, drawer = false }) {
  const [collapsed, setCollapsed] = useState(false);
  // Sections fold like the main menu (Mike 10-29): only the open tab's section
  // starts open; the ones you open stay open per user.
  const sectionOf = (tab) => config.find(s => s.items.some(i => i.id === tab))?.section;
  const [expandedSections, setExpandedSections] = useState(
    () => [sectionOf(activeTab)].filter(Boolean)
  );
  const openKey = userId ? `project_menu_open_${userId}` : null;

  // SSR-safe: read localStorage after mount only
  useEffect(() => {
    if (!userId) return;
    try {
      if (localStorage.getItem(`sidebar_collapsed_${userId}`) === 'true') setCollapsed(true);
      const saved = JSON.parse(localStorage.getItem(openKey) || 'null');
      if (Array.isArray(saved)) setExpandedSections(prev => [...new Set([...saved, ...prev])]);
    } catch {}
  }, [userId]);

  // Moving to a tab opens its section.
  useEffect(() => {
    const s = sectionOf(activeTab);
    if (s) setExpandedSections(prev => (prev.includes(s) ? prev : [...prev, s]));
  }, [activeTab]);

  useEffect(() => {
    if (!openKey) return;
    try { localStorage.setItem(openKey, JSON.stringify(expandedSections)); } catch {}
  }, [openKey, expandedSections]);

  function togglePin() {
    const next = !collapsed;
    setCollapsed(next);
    if (userId) try { localStorage.setItem(`sidebar_collapsed_${userId}`, String(next)); } catch {}
  }

  function toggleSection(section) {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  }

  // All items flat, for rail
  const allItems = config.flatMap(s => s.items);

  // ── Collapsed rail ──────────────────────────────────────────────────────────
  if (collapsed && !drawer) {
    return (
      <aside className="hidden md:flex w-11 shrink-0 bg-white border-r border-slate-200 self-start sticky top-0 h-screen overflow-y-auto flex-col items-center py-2 gap-1">
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
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-orange-500 border border-white" />
              )}
            </button>
          );
        })}
      </aside>
    );
  }

  // ── Expanded sidebar ────────────────────────────────────────────────────────
  return (
    <aside className={drawer ? 'w-full' : 'hidden md:block w-52 shrink-0 bg-white border-r border-slate-200 self-start sticky top-0 h-screen overflow-y-auto'}>
      {/* Pin button in header area */}
      <div className={drawer ? 'hidden' : 'flex items-center justify-end px-2 pt-1 pb-0'}>
        <button
          onClick={togglePin}
          title="Collapse sidebar"
          className="w-6 h-6 flex items-center justify-center rounded-md text-amber-500 hover:bg-amber-50 transition-colors"
        >
          <Pin size={13} />
        </button>
      </div>

      <nav className="pb-2">
        {config.map((section, si) => {
          const isExpanded = expandedSections.includes(section.section);
          const hasActive = section.items.some(i => i.id === activeTab);
          const sectionBadge = section.items.reduce((n, i) => n + (badges[i.id] || 0), 0);
          return (
            <div key={section.section}>
              {si > 0 && <div className="mx-3 border-t border-slate-100 my-1" />}

              <button
                onClick={() => toggleSection(section.section)}
                aria-expanded={isExpanded}
                className={`w-full flex items-center gap-2 px-4 ${drawer ? 'py-3' : 'py-1.5'} text-left transition-colors group ${hasActive && !isExpanded ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
              >
                <span className="text-slate-300 text-xs">{section.icon}</span>
                <span className={`flex-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${hasActive ? 'text-amber-700' : 'text-slate-500 group-hover:text-slate-700'}`}>
                  {section.section}
                </span>
                {!isExpanded && sectionBadge > 0 && (
                  <span className="w-2 h-2 rounded-full bg-orange-500" title={`${sectionBadge} waiting`} />
                )}
                <svg
                  className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="mb-0.5">
                  {section.items.map(item => {
                    const isActive = activeTab === item.id;
                    const badge = badges[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={[
                          `w-full text-left px-4 ${drawer ? 'py-2.5 text-base' : 'py-1 text-sm'} transition-colors border-l-2 flex items-center gap-2`,
                          isActive
                            ? 'border-orange-500 bg-amber-50 text-amber-700 font-semibold'
                            : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        ].join(' ')}
                      >
                        <span className={isActive ? 'text-amber-500' : 'text-slate-300'}>
                          <NavIcon name={item.icon} size={14} />
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && (
                          <span className="text-[11px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
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
