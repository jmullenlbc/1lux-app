'use client';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import TasksClient from './TasksClient';
import QcBoardClient from '../qc/QcBoardClient';
import { TAB_ACTIVE, TAB_INACTIVE } from '@/components/ui/tokens';

function TabBtn({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
    >
      {label}
      <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
        active ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
      }`}>
        {count}
      </span>
    </button>
  );
}

export default function TasksQcClient({ tasks, users, currentUser, reports, initialTab = 'tasks', focusId }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const router   = useRouter();
  const pathname = usePathname();

  function switchTab(tab) {
    setActiveTab(tab);
    router.replace(tab === 'bugs' ? `${pathname}?tab=bugs` : pathname, { scroll: false });
  }

  const openBugs  = reports.filter(r => r.status !== 'FIXED' && !r.archivedAt).length;
  const openTasks = tasks.filter(t => t.status !== 'DONE').length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 flex items-center gap-1">
        <TabBtn
          label="Task Board"
          count={openTasks}
          active={activeTab === 'tasks'}
          onClick={() => switchTab('tasks')}
        />
        <TabBtn
          label="Bug Tracker"
          count={openBugs}
          active={activeTab === 'bugs'}
          onClick={() => switchTab('bugs')}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'tasks' && (
          <TasksClient tasks={tasks} users={users} currentUser={currentUser} />
        )}
        {activeTab === 'bugs' && (
          <QcBoardClient reports={reports} users={users} currentUser={currentUser} focusId={focusId} />
        )}
      </div>
    </div>
  );
}
