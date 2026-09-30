import {
  answerPerformanceRequests,
  makePerformanceReports
} from '@app-game/solid-gpu/performance/makePerformanceReports';

/**
 * The page's frame-cost monitors. Importing this module installs `window.paintPerformance` (`report({ samples? })`
 * and `reset()`) for in-page automation such as Playwright; it reports no monitors until one is enabled. During
 * `vite dev`, the same reports are served at `/__performance` (see the bridge plugin in `vite.config.ts`).
 */
export const paintPerformance = makePerformanceReports();

declare global {
  interface Window {
    /** Frame-cost reports of enabled paint performance monitors; see `paintPerformance`. */
    paintPerformance?: Pick<typeof paintPerformance, 'report' | 'reset'>;
  }
}

if (typeof window !== 'undefined') {
  window.paintPerformance = { report: paintPerformance.report, reset: paintPerformance.reset };
}

// Answers the dev server's `/__performance` requests. A hot update replaces this module and its monitor set, so the
// replaced module stops answering.
if (import.meta.hot) {
  import.meta.hot.dispose(answerPerformanceRequests(import.meta.hot, paintPerformance, 'paint-performance'));
}
