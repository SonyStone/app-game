import { DEVTOOLS_PORT_NAME, isAgentStatus } from './protocol';

const subscriptions = new Map<chrome.runtime.Port, number>();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== DEVTOOLS_PORT_NAME) return;
  port.onMessage.addListener((message: unknown) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      message.type !== 'subscribe' ||
      !('tabId' in message) ||
      typeof message.tabId !== 'number' ||
      !Number.isInteger(message.tabId)
    )
      return;
    subscriptions.set(port, message.tabId);
    injectBridge({ tabId: message.tabId, allFrames: true });
  });
  port.onDisconnect.addListener(() => subscriptions.delete(port));
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (
    !isAgentStatus(message) ||
    message.type !== 'webgl-spector-bridge-status' ||
    sender.tab?.id === undefined ||
    sender.frameId === undefined ||
    !sender.documentId
  )
    return;
  for (const [port, tabId] of subscriptions) {
    if (tabId !== sender.tab.id) continue;
    try {
      port.postMessage({
        type: 'webgl-spector-panel-status',
        frameId: sender.frameId,
        documentId: sender.documentId,
        status: message.status,
        statusRevision: message.statusRevision,
        captureRevision: message.captureRevision
      });
    } catch {
      subscriptions.delete(port);
    }
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (![...subscriptions.values()].includes(details.tabId)) return;
  injectBridge({ tabId: details.tabId, documentIds: [details.documentId] });
});

function injectBridge(target: chrome.scripting.InjectionTarget): void {
  void chrome.scripting.executeScript({ target, files: ['bridge.js'] }).catch(() => {
    // Restricted pages do not allow injection.
  });
}
