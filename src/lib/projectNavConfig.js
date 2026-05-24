// NAV_CONFIG drives the project sidebar.
// Keys must exactly match the serviceType enum values in the DB.
// FULL_SERVICE_DESIGN and DESIGN_ASSIST share the same nav structure.
// PEER_REVIEW and BID_ONLY share the same nav structure.

export const NAV_CONFIG = {
  FULL_SERVICE_DESIGN: [
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
        { id: 'budgets',   label: 'Budgets' },
        { id: 'takeoffs',  label: 'Takeoffs' },
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
        { id: 'submittals',     label: 'Submittals' },
        { id: 'ship-schedule',  label: 'Ship Schedule' },
        { id: 'contracts',      label: 'Contracts' },
        { id: 'ca',             label: 'CA' },
        { id: 'notifications',  label: 'External Notifications' },
      ],
    },
    {
      section: 'Communications',
      icon: '◎',
      items: [
        { id: 'meetings',        label: 'Meetings' },
        { id: 'correspondence',  label: 'Correspondence' },
      ],
    },
  ],

  DESIGN_ASSIST: null, // assigned below — same as FULL_SERVICE_DESIGN

  PEER_REVIEW: [
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
        { id: 'submittals',     label: 'Submittals' },
        { id: 'ship-schedule',  label: 'Ship Schedule' },
        { id: 'contracts',      label: 'Contracts' },
        { id: 'ca',             label: 'CA' },
        { id: 'notifications',  label: 'External Notifications' },
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

  BID_ONLY: null, // assigned below — same as PEER_REVIEW
};

NAV_CONFIG.DESIGN_ASSIST = NAV_CONFIG.FULL_SERVICE_DESIGN;
NAV_CONFIG.BID_ONLY      = NAV_CONFIG.PEER_REVIEW;

// Helper: default tab for a given service type
export function getDefaultTab() {
  return 'dashboard';
}

// Helper: all valid tab ids for a given service type
export function getValidTabIds(serviceType) {
  const config = NAV_CONFIG[serviceType] ?? NAV_CONFIG.FULL_SERVICE_DESIGN;
  return config.flatMap(section => section.items.map(item => item.id));
}
