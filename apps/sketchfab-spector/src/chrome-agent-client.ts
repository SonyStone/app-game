import type { AgentClient, FrameTarget } from './agent-client';
import {
  AGENT_KEY,
  AGENT_VERSION,
  DEVTOOLS_PORT_NAME,
  isAgentSnapshot,
  isPushedStatus,
  unwrapAgentResponse,
  type AgentCommands
} from './protocol';

/** Routes every operation to an exact document in the inspected tab. */
export function createChromeAgentClient(tabId: number): AgentClient {
  return {
    listFrames: async () => {
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      return (frames ?? [])
        .filter((frame) => frame.documentLifecycle === 'active')
        .map((frame) => ({
          documentId: frame.documentId,
          frameId: frame.frameId,
          url: frame.url,
          isTop: frame.frameId === 0
        }))
        .sort((left, right) => Number(right.isTop) - Number(left.isTop));
    },
    async inspect(target) {
      let snapshot: unknown;
      try {
        snapshot = await call(target, 'inspect');
      } catch {
        await install(target);
        snapshot = await call(target, 'inspect');
      }
      if (!isAgentSnapshot(snapshot)) throw new Error('The page returned an invalid agent snapshot.');
      if (snapshot.version !== AGENT_VERSION) {
        await install(target);
        snapshot = await call(target, 'inspect');
        if (!isAgentSnapshot(snapshot) || snapshot.version !== AGENT_VERSION) {
          throw new Error('Reload the inspected page to update its capture agent.');
        }
      }
      return snapshot;
    },
    call,
    subscribe: (onStatus, onNavigated) => {
      let disposed = false;
      let port: chrome.runtime.Port | undefined;
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
      const receive = (message: unknown) => {
        if (isPushedStatus(message)) onStatus(message);
      };
      const connect = () => {
        if (disposed) return;
        port = chrome.runtime.connect({ name: DEVTOOLS_PORT_NAME });
        port.onMessage.addListener(receive);
        port.onDisconnect.addListener(() => {
          if (!disposed) reconnectTimer = setTimeout(connect, 1000);
        });
        port.postMessage({ type: 'subscribe', tabId });
      };
      const navigate = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
        if (details.tabId === tabId) onNavigated();
      };
      connect();
      chrome.webNavigation.onCommitted.addListener(navigate);
      return () => {
        disposed = true;
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
        port?.disconnect();
        chrome.webNavigation.onCommitted.removeListener(navigate);
      };
    }
  };

  async function install(target: FrameTarget): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId, documentIds: [target.documentId] },
      world: 'MAIN',
      files: ['agent.js']
    });
  }

  async function call<K extends keyof AgentCommands>(
    target: FrameTarget,
    method: K,
    ...args: Parameters<AgentCommands[K]>
  ): Promise<ReturnType<AgentCommands[K]>> {
    const results = await chrome.scripting.executeScript({
      target: { tabId, documentIds: [target.documentId] },
      world: 'MAIN',
      func: invokePageAgent,
      args: [AGENT_KEY, method, args]
    });
    const result = results.find((result) => result.documentId === target.documentId);
    if (!result) throw new Error('The capture document is no longer available.');
    return unwrapAgentResponse<ReturnType<AgentCommands[K]>>(result.result);
  }
}

/** Serialized by Chrome into MAIN; must not close over imports or local variables. */
async function invokePageAgent(key: string, method: string, args: readonly unknown[]): Promise<unknown> {
  try {
    const host = globalThis as unknown as Record<string, Record<string, unknown> | undefined>;
    const agent = host[key];
    const operation = agent?.[method];
    if (typeof operation !== 'function') throw new Error('The Spector agent is not installed in this document.');
    return await Reflect.apply(operation, agent, args);
  } catch (error: unknown) {
    return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
