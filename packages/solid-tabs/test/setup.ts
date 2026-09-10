import { vi } from 'vitest';

// jsdom has no layout observer; geometry-specific behavior is checked in-browser.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
