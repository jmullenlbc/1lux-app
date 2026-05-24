'use client';
import { useState } from 'react';

export default function ProjectSidebar({ config, activeTab, onTabChange }) {
  const [expandedSections, setExpandedSections] = useState(
    () => config.map(s => s.section)
  );

  function toggleSection(section) {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  }

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200 self-start sticky top-0 min-h-screen overflow-y-auto">
      <nav className="py-3">
        {config.map((section, si) => {
          const isExpanded = expandedSections.includes(section.section);
          return (
            <div key={section.section}>
              {/* Section divider (skip first) */}
              {si > 0 && <div className="mx-3 border-t border-slate-100 my-2" />}

              {/* Section header */}
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

              {/* Section items */}
              {isExpanded && (
                <div className="mt-0.5 mb-1">
                  {section.items.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={[
                          'w-full text-left px-4 py-2 text-sm transition-colors border-l-2',
                          isActive
                            ? 'border-amber-500 bg-amber-50 text-amber-700 font-semibold'
                            : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        ].join(' ')}
                      >
                        {item.label}
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
