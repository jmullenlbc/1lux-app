// NAV_CONFIG drives the project sidebar.
// Keys match the serviceType enum values stored in the DB exactly.
// fullDesign and designAssist share the same nav structure.
// peerReview, bidOnly, and other share the same nav structure.
//
// icon: Lucide icon name — used by ProjectSidebar for the collapsed rail.

export const NAV_CONFIG = {
  fullDesign: [
    {
      section: 'Overview',
      icon: '⊡',
      items: [
        { id: 'dashboard',       label: 'Dashboard',       icon: 'LayoutDashboard' },
      ],
    },
    {
      section: 'Pre-Construction',
      icon: '◈',
      items: [
        { id: 'budgets',         label: 'Budgets',         icon: 'Calculator' },
        { id: 'takeoffs',        label: 'Takeoffs',        icon: 'Ruler' },
      ],
    },
    {
      section: 'Design',
      icon: '✦',
      items: [
        { id: 'drawings',        label: 'Drawings',        icon: 'FileText' },
        { id: 'fixture-schedule',label: 'Fixture Schedule',icon: 'ListChecks' },
        { id: 'code',            label: 'Code',            icon: 'Code2' },
        { id: 'design-schedule', label: 'Design Schedule', icon: 'CalendarDays' },
        { id: 'rfis',            label: 'RFIs',            icon: 'HelpCircle' },
        { id: 'design-contracts',label: 'Contracts',       icon: 'Receipt' },
      ],
    },
    {
      section: 'Construction',
      icon: '◉',
      items: [
        { id: 'submittals',            label: 'Submittals',           icon: 'ClipboardCheck' },
        { id: 'ship-schedule',         label: 'Ship Schedule',        icon: 'Truck' },
        { id: 'change-orders',         label: 'Change Orders',        icon: 'FileDiff' },
        { id: 'construction-schedule', label: 'Construction Schedule',icon: 'CalendarClock' },
        { id: 'contracts',             label: 'Contracts',            icon: 'Receipt' },
        { id: 'notifications',         label: 'Client Portal Access', icon: 'Users' },
      ],
    },
    {
      section: 'Communications',
      icon: '◎',
      items: [
        { id: 'meetings',        label: 'Meetings',        icon: 'Calendar' },
        { id: 'correspondence',  label: 'Correspondence',  icon: 'Mail' },
      ],
    },
  ],

  designAssist: null, // assigned below — same as fullDesign

  peerReview: [
    {
      section: 'Overview',
      icon: '⊡',
      items: [
        { id: 'dashboard',       label: 'Dashboard',       icon: 'LayoutDashboard' },
      ],
    },
    {
      section: 'Pre-Construction',
      icon: '◈',
      items: [
        { id: 'budgets',         label: 'Budgets',         icon: 'Calculator' },
        { id: 'drawings',        label: 'Drawings',        icon: 'FileText' },
        { id: 'fixture-schedule',label: 'Fixture Schedule',icon: 'ListChecks' },
        { id: 'takeoffs',        label: 'Takeoffs',        icon: 'Ruler' },
        { id: 'rfis',            label: 'RFIs',            icon: 'HelpCircle' },
      ],
    },
    {
      section: 'Construction',
      icon: '◉',
      items: [
        { id: 'submittals',            label: 'Submittals',           icon: 'ClipboardCheck' },
        { id: 'ship-schedule',         label: 'Ship Schedule',        icon: 'Truck' },
        { id: 'construction-schedule', label: 'Construction Schedule',icon: 'CalendarClock' },
        { id: 'change-orders',         label: 'Change Orders',        icon: 'FileDiff' },
        { id: 'contracts',             label: 'Contracts',            icon: 'Receipt' },
        { id: 'notifications',         label: 'Client Portal Access', icon: 'Users' },
      ],
    },
    {
      section: 'Communications',
      icon: '◎',
      items: [
        { id: 'meetings',        label: 'Meetings',        icon: 'Calendar' },
        { id: 'correspondence',  label: 'Correspondence',  icon: 'Mail' },
      ],
    },
  ],

  bidOnly: null, // assigned below — same as peerReview
  other:   null, // assigned below — same as peerReview
};

NAV_CONFIG.designAssist = NAV_CONFIG.fullDesign;
NAV_CONFIG.bidOnly      = NAV_CONFIG.peerReview;
NAV_CONFIG.other        = NAV_CONFIG.peerReview;

// Helper: default tab for any service type
export function getDefaultTab() {
  return 'dashboard';
}

// Helper: all valid tab ids for a given service type
export function getValidTabIds(serviceType) {
  const config = NAV_CONFIG[serviceType] ?? NAV_CONFIG.fullDesign;
  return config.flatMap(section => section.items.map(item => item.id));
}
