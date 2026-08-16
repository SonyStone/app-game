import { installLiveCheckpointTracking } from '../backends/chrome/liveCheckpoint';
import {
  createAutomaticGoogleDriveBackupWhenDue,
  GOOGLE_DRIVE_BACKUP_ALARM
} from '../backends/chrome/googleDriveBackups';
import { consumeInternalChromeTabCreation } from '../backends/chrome/tabCreation';
import { withPersistentTreeMutationLock } from '../backends/chrome/treeMutationLock';
import {
  preserveClosedLiveTab,
  preserveClosedLiveWindow,
  relateNewLiveTabToOpener,
  reconcileMovedLiveTab,
  saveAndCloseAllWindows,
  saveAndCloseTab,
  saveAndCloseWindow,
  synchronizeLiveTree,
  updateLiveWindowBounds
} from '../backends/chrome/savedItems';
import { readBrowserAtlasSettings } from '../settings';

const explorerPageUrl = chrome.runtime.getURL('explorer.html');

installLiveCheckpointTracking(chrome);
installLiveAttachmentTracking();
installGoogleDriveBackupSchedule();
installBrowserActionStatistics();

chrome.action.onClicked.addListener((sourceTab) => {
  void openOrFocusExplorer(sourceTab.windowId).catch(reportCommandError);
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    'kind' in message &&
    message.kind === 'open-browser-atlas-standalone'
  ) {
    void createExplorerPopup(explorerPageUrl).catch(reportCommandError);
  }
});

chrome.runtime.onStartup.addListener(() => {
  void openExplorerWhenConfigured().catch(reportCommandError);
});

chrome.commands.onCommand.addListener((command) => {
  void withPersistentTreeMutationLock(() => executeKeyboardCommand(command)).catch(reportCommandError);
});

/** Opens the full explorer page or focuses its existing browser tab. */
async function openOrFocusExplorer(sourceWindowId?: number): Promise<chrome.tabs.Tab> {
  const [existingTab] = await chrome.tabs.query({ url: `${explorerPageUrl}*` });

  if (existingTab?.id !== undefined) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId !== undefined) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    if (sourceWindowId !== undefined) {
      await chrome.runtime.sendMessage({
        kind: 'reveal-browser-window',
        windowId: String(sourceWindowId)
      });
    }
    return existingTab;
  }

  const url = new URL(explorerPageUrl);
  if (sourceWindowId !== undefined) {
    url.searchParams.set('focusWindowId', String(sourceWindowId));
  }
  return createExplorerPopup(url.href);
}

async function createExplorerPopup(url: string): Promise<chrome.tabs.Tab> {
  const browserWindow = await chrome.windows.create({
    url,
    type: 'popup',
    focused: true,
    width: EXPLORER_WINDOW_WIDTH,
    height: EXPLORER_WINDOW_HEIGHT
  });
  if (!browserWindow) {
    throw new Error('Chromium did not create the Browser Atlas window.');
  }
  const createdTab = browserWindow.tabs?.[0] ?? (
    browserWindow.id === undefined
      ? undefined
      : (await chrome.tabs.query({ windowId: browserWindow.id }))[0]
  );
  if (!createdTab) {
    throw new Error('Chromium created a Browser Atlas window without an explorer tab.');
  }
  return createdTab;
}

function installBrowserActionStatistics(): void {
  const refresh = () => {
    void updateBrowserActionStatistics().catch(reportCommandError);
  };
  chrome.tabs.onCreated.addListener(refresh);
  chrome.tabs.onRemoved.addListener(refresh);
  chrome.windows.onCreated.addListener(refresh);
  chrome.windows.onRemoved.addListener(refresh);
  void chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  refresh();
}

async function updateBrowserActionStatistics(): Promise<void> {
  const browserWindows = await chrome.windows.getAll({ populate: true });
  const tabCount = browserWindows.reduce(
    (total, browserWindow) => total + (browserWindow.tabs?.length ?? 0),
    0
  );
  await Promise.all([
    chrome.action.setBadgeText({ text: String(tabCount) }),
    chrome.action.setTitle({
      title: `${browserWindows.length} windows / ${tabCount} tabs · Open Browser Atlas`
    })
  ]);
}

async function openExplorerWhenConfigured(): Promise<void> {
  if ((await readBrowserAtlasSettings()).openOnStartup) {
    await openOrFocusExplorer();
  }
}

async function executeKeyboardCommand(command: string): Promise<void> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id === undefined) {
    return;
  }
  const explorerTab = await openOrFocusExplorer();
  switch (command) {
    case 'save_close_current_tab':
      if (activeTab.id !== explorerTab.id) {
        await saveAndCloseTab(chrome, activeTab.id);
      }
      return;
    case 'save_close_current_window':
      if (activeTab.windowId !== explorerTab.windowId) {
        await saveAndCloseWindow(chrome, activeTab.windowId);
      }
      return;
    case 'save_close_all_windows':
      await saveAndCloseAllWindows(chrome, explorerTab.windowId);
      return;
    default:
      return;
  }
}

function reportCommandError(reason: unknown): void {
  console.error('Browser Atlas could not execute the keyboard command.', reason);
}

function installLiveAttachmentTracking(): void {
  let mutationQueue = Promise.resolve();
  const ignoredInternalTabIds = new Set<number>();
  const reconcileTab = (tabId: number) => {
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(() => reconcileMovedLiveTab(chrome, tabId)))
      .catch(reportAttachmentError);
  };
  chrome.tabs.onAttached.addListener(reconcileTab);
  chrome.tabs.onMoved.addListener(reconcileTab);
  chrome.tabs.onActivated.addListener(queueFullSynchronization);
  chrome.tabs.onCreated.addListener(queueCreatedTab);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (
      tab.id !== undefined &&
      !ignoredInternalTabIds.has(tab.id) &&
      (changeInfo.url !== undefined ||
        changeInfo.title !== undefined ||
        changeInfo.favIconUrl !== undefined ||
        changeInfo.pinned !== undefined ||
        changeInfo.status === 'complete')
    ) {
      queueUpdatedTab(tab);
    }
  });
  chrome.tabs.onReplaced.addListener(queueFullSynchronization);
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (removeInfo.isWindowClosing) {
      return;
    }
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(() => preserveClosedLiveTab(chrome, tabId)))
      .catch(reportAttachmentError);
  });
  chrome.windows.onRemoved.addListener((windowId) => {
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(() => preserveClosedLiveWindow(chrome, windowId)))
      .catch(reportAttachmentError);
  });
  chrome.windows.onBoundsChanged.addListener((browserWindow) => {
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(() => updateLiveWindowBounds(chrome, browserWindow)))
      .catch(reportAttachmentError);
  });
  chrome.windows.onFocusChanged.addListener(queueFullSynchronization);
  queueFullSynchronization();

  function queueFullSynchronization(): void {
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(async () =>
        synchronizeLiveTree(chrome, (await readBrowserAtlasSettings()).nestNewTabsUnderOpener)
      ))
      .catch(reportAttachmentError);
  }

  function queueCreatedTab(tab: chrome.tabs.Tab): void {
    if (tab.id === undefined) {
      return;
    }
    const tabId = tab.id;
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(async () => {
        if (await consumeInternalChromeTabCreation(chrome, tab)) {
          ignoredInternalTabIds.add(tabId);
          return;
        }
        await relateOpenerWhenConfigured(tab);
      }))
      .catch(reportAttachmentError);
  }

  function queueUpdatedTab(tab: chrome.tabs.Tab): void {
    if (tab.id === undefined) {
      return;
    }
    const tabId = tab.id;
    mutationQueue = mutationQueue
      .then(() => withPersistentTreeMutationLock(async () => {
        if (ignoredInternalTabIds.has(tabId)) {
          return;
        }
        await reconcileMovedLiveTab(chrome, tabId);
        if (tab.openerTabId !== undefined) {
          await relateOpenerWhenConfigured(tab);
        }
      }))
      .catch(reportAttachmentError);
  }

  async function relateOpenerWhenConfigured(tab: chrome.tabs.Tab): Promise<void> {
    if (
      tab.id !== undefined &&
      tab.openerTabId !== undefined &&
      (await readBrowserAtlasSettings()).nestNewTabsUnderOpener
    ) {
      await relateNewLiveTabToOpener(chrome, tab.id, tab.openerTabId);
    }
  }
}

function reportAttachmentError(reason: unknown): void {
  console.error('Browser Atlas could not preserve context attached to a closed browser item.', reason);
}

function installGoogleDriveBackupSchedule(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === GOOGLE_DRIVE_BACKUP_ALARM) {
      void createAutomaticGoogleDriveBackupWhenDue(chrome);
    }
  });
  void chrome.alarms.create(GOOGLE_DRIVE_BACKUP_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 60
  });
  void createAutomaticGoogleDriveBackupWhenDue(chrome);
}

const EXPLORER_WINDOW_WIDTH = 900;
const EXPLORER_WINDOW_HEIGHT = 900;
