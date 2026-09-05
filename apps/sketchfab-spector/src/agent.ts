import { createPageAgent } from './page-agent';
import { AGENT_KEY, AGENT_VERSION, type PageAgent } from './protocol';

/** Installs one owned page agent without stacking WebGL and timer patches. */
function installAgent(): void {
  const host = globalThis as typeof globalThis & { [AGENT_KEY]?: PageAgent };
  const previous = host[AGENT_KEY];
  if (previous?.version === AGENT_VERSION) return;
  if (previous && typeof previous.dispose !== 'function') {
    throw new Error('Reload the inspected page to update its capture agent.');
  }
  previous?.dispose();
  Object.defineProperty(host, AGENT_KEY, {
    configurable: true,
    enumerable: false,
    value: createPageAgent()
  });
}

installAgent();
