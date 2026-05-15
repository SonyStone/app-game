// ============================================================================
// MARK: Navigation Structure
// ============================================================================

export type NavItem = {
  label: string;
  href: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    title: 'Draggable',
    items: [{ label: 'Sensor', href: './' }]
  },
  {
    title: 'Sortable',
    items: [{ label: 'Sortable overlay', href: './sortable-overlay' }]
  },
  {
    title: 'Containers',
    items: [
      { label: 'Nested', href: './nested' },
      { label: 'Nested overlay', href: './nested-overlay' }
    ]
  }
];
