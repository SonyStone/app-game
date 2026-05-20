// ============================================================================
// MARK: Types
// ============================================================================

export type NavItem = {
  label: string;
  href: string;
  badge?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

// ============================================================================
// MARK: Navigation Structure
// ============================================================================

export const navSections: NavSection[] = [
  {
    title: 'Getting Started',
    items: [{ label: 'Overview', href: './' }]
  },
  {
    title: 'Reactivity',
    items: [
      { label: 'Signals', href: './signals' },
      { label: 'Derived & Memo', href: './derived' },
      { label: 'Effects', href: './effects' },
      { label: 'Batching & Untrack', href: './batching' }
    ]
  },
  {
    title: 'State Management',
    items: [
      { label: 'Stores', href: './stores' },
      { label: 'Context', href: './context' }
    ]
  },
  {
    title: 'Components',
    items: [
      { label: 'Component Patterns', href: './components' },
      { label: 'Control Flow', href: './control-flow' },
      { label: 'Props & Spreading', href: './props' },
      { label: 'Pass Data', href: './pass-data' }
    ]
  },
  {
    title: 'Async',
    items: [
      { label: 'Resources', href: './resources' },
      { label: 'Suspense & Lazy', href: './suspense' }
    ]
  },
  {
    title: 'Advanced',
    items: [
      { label: 'Primitives', href: './primitives' },
      { label: 'Owner & Computation', href: './owner-computation' },
      { label: 'Directives', href: './directives' }
    ]
  }
];
