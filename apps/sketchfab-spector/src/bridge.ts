import { AGENT_STATUS_MESSAGE, isAgentStatus } from './protocol';

const host = globalThis as typeof globalThis & { __APP_GAME_WEBGL_SPECTOR_STATUS_BRIDGE__?: boolean };
if (!host.__APP_GAME_WEBGL_SPECTOR_STATUS_BRIDGE__) {
  host.__APP_GAME_WEBGL_SPECTOR_STATUS_BRIDGE__ = true;
  window.addEventListener('message', forwardStatus);
}

/** Only capture progress crosses the page-to-extension bridge. */
function forwardStatus(event: MessageEvent<unknown>): void {
  if (event.source !== window || !isAgentStatus(event.data) || event.data.type !== AGENT_STATUS_MESSAGE) return;
  void chrome.runtime
    .sendMessage({
      type: 'webgl-spector-bridge-status',
      status: event.data.status,
      statusRevision: event.data.statusRevision,
      captureRevision: event.data.captureRevision
    })
    .catch(() => {
      /* The panel or extension may have closed. */
    });
}
