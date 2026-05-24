// NAV_CONFIG drives the project sidebar.
// Keys match the serviceType enum values stored in the DB exactly.
// fullDesign and designAssist share the same nav structure.
// peerReview, bidOnly, and other share the same nav structure.

export const NAV_CONFIG = {
  fullDesign: [
    {
      section: 'Overview',
      icon: '⊡',
      items: [
        { id: 'dashboard', label: 'Dashboard' },
      ],
    },
    {
      section: 'Pre-Construction',
      icon: '◈',
      items: [
        { id: 'budgets',  label: 'Budgets' },
        { id: 'takeoffs', label: 'Takeoffs' },
      ],
    },
    {
      section: 'Design',
      icon: '✦',
      items: [
        { id: 'drawings',         label: 'Drawings' },
        { id: 'fixture-schedule', label: 'Fixture Schedule' },
        { id: 'design-info',      label: 'Design Info' },
      ],
    },
    {
      section: 'Construction',
      icon: '◉',
      items: [
        { id: 'submittals',    label: 'Submittals' },
        { id: 'ship-schedule', label: 'Ship Schedule' },
        { id: 'contracts',     label: 'Contracts' },
        { id: 'ca',            label: 'CA' },
        { id: 'notifications', label: 'External Notifications' },
      ],
    },
    {
      section: 'Communications',
      icon: '◎',
      items: [
        { id: 'meetings',       label: 'Meetings' },
        { id: 'correspondence', label: 'Correspondence' },
      ],
    },
  ],

  designAssist: null, // assigned below — same as fullDesign

  peerReview: [
    {
      section: 'Overview',
      icon: '⊡',
      items: [
        { id: 'dashboard', label: 'Dashboard' },
      ],
    },
    {
      section: 'Pre-Construction',
      icon: '◈',
      items: [
        { id: 'budgets',          label: 'Budgets' },
        { id: 'drawings',         label: 'Drawings' },
        { id: 'fixture-schedule', label: 'Fixture Schedule' },
        { id: 'takeoffs',         label: 'Takeoffs' },
      ],
    },
    {
      section: 'Construction',
      icon: '◉',
      items: [
        { id: 'submittals',    label: 'Submittals' },
        { id: 'ship-schedule', label: 'Ship Schedule' },
        { id: 'contracts',     label: 'Contracts' },
        { id: 'ca',            label: 'CA' },
        { id: 'notifications', label: 'External Notifications' },
      ],
    },
    {
      section: 'Communications',
      icon: '◎',
      items: [
        { id: 'meetings',       label: 'Meetings' },
        { id: 'correspondence', label: 'Correspondence' },
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
