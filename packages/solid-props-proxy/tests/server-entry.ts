import { generateHydrationScript, renderToString } from '@solidjs/web';
import { App } from './hydration-app';

/** Uses the actual server runtime and compiler to produce the browser fixture. */
export function renderFixture() {
  return `${generateHydrationScript()}<div id="app">${renderToString(App)}</div>`;
}
