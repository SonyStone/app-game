import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
  type Worker
} from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDirectory = fileURLToPath(new URL('../dist-extension', import.meta.url));
const testServerOrigin = 'http://127.0.0.1:3161';
const sourceUrl = `${testServerOrigin}/source`;
const targetUrl = `${testServerOrigin}/target`;
const CLIPBOARD_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

test('opens current Help, About, and Cloud dialogs in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);

  try {
    await session.page.getByRole('button', { name: 'Help', exact: true }).click();
    const help = session.page.getByRole('dialog', { name: 'Browser Atlas help' });
    await expect(help).toContainText('Each pane can independently show');
    await session.page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);

    await session.page.getByRole('button', { name: 'About', exact: true }).click();
    const about = session.page.getByRole('dialog', { name: 'About Browser Atlas' });
    await expect(about).toContainText('Version 0.0.1');
    await expect(about).toContainText('Tabs Outliner by Vladyslav Volovyk');
    await about.getByRole('button', { name: 'Close About Browser Atlas' }).click();
    await expect(about).toHaveCount(0);

    await session.page.getByRole('button', { name: 'Cloud', exact: true }).click();
    const cloud = session.page.getByRole('dialog', { name: 'Google Drive backups' });
    await expect(cloud.locator('[data-cloud-backup-attempt="none"]')).toBeVisible();
    await expect(cloud).toContainText('This Browser Atlas build has no Google OAuth client ID.');
    await cloud.getByRole('button', { name: 'Close cloud backups' }).click();
    await expect(cloud).toHaveCount(0);

    await expect.poll(() => readBrowserActionStatistics(session.serviceWorker)).toEqual({
      badgeMatchesTabCount: true,
      titleMatchesCounts: true
    });
    await expect(
      session.serviceWorker.evaluate(() => Object.keys(chrome.runtime.getManifest().commands ?? {}))
    ).resolves.toContain('_execute_action');

    const popupPromise = session.context.waitForEvent('page', {
      predicate: (candidate) => candidate !== session.page
    });
    await session.page.getByRole('button', { name: 'Pop out', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/explorer\.html/u);
    await expect(popup.getByRole('heading', { name: 'Browser Atlas' })).toBeVisible();
    await expect.poll(() => readExplorerWindowTypes(session.serviceWorker)).toContain('popup');
    await popup.close();
  } finally {
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('shows success and failure backup-attempt strips from Chromium session storage', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  const storageKey = 'browserAtlas.googleDriveBackupAttempt.v1';

  try {
    const cloudButton = session.page.getByTitle('Manage manual and automatic remote tree backups');
    await expect(cloudButton).toHaveAttribute('data-action-status', 'none');
    await session.serviceWorker.evaluate(async ({ key }) => {
      await chrome.storage.session.set({
        [key]: { status: 'success', attemptedAt: Date.now(), mode: 'manual' }
      });
    }, { key: storageKey });
    await session.page.reload();
    await expect(cloudButton).toHaveAttribute('data-action-status', 'success');
    await cloudButton.click();
    await expect(
      session.page.locator('[data-cloud-backup-attempt="success"]')
    ).toContainText('Last manual cloud backup succeeded');
    await session.page.getByRole('button', { name: 'Close cloud backups' }).click();

    await session.serviceWorker.evaluate(async ({ key }) => {
      await chrome.storage.session.set({
        [key]: {
          status: 'failure',
          attemptedAt: Date.now(),
          mode: 'automatic',
          message: 'Simulated Google Drive outage'
        }
      });
    }, { key: storageKey });
    await session.page.reload();
    await expect(cloudButton).toHaveAttribute('data-action-status', 'failure');
    await cloudButton.click();
    const failedAttempt = session.page.locator('[data-cloud-backup-attempt="failure"]');
    await expect(failedAttempt).toContainText('Last automatic cloud backup failed');
    await expect(failedAttempt).toContainText('Simulated Google Drive outage');
  } finally {
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('highlights Chromium windows saved by Save All for the browser session', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    browserState = await createTestBrowserState(session.serviceWorker);
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await acceptNextConfirmation(session.page, () =>
      leftPane.getByTitle('Save and close all other browser windows').click()
    );

    const highlightedWindows = leftPane.locator(
      '[data-node-id^="explore-saved-window-"] [data-transient-status="recently-saved"]'
    );
    await expect(highlightedWindows).toHaveCount(2);
    await session.page.reload();
    await expect(highlightedWindows).toHaveCount(2);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('reveals the source Chromium window requested by the extension action', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');
    await root.getByRole('button', { name: 'Collapse node' }).click();
    await session.page.bringToFront();
    await session.serviceWorker.evaluate(async (windowId) => {
      await chrome.runtime.sendMessage({ kind: 'reveal-browser-window', windowId: String(windowId) });
    }, state.targetWindowId);

    await expect(leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`)).toHaveAttribute(
      'aria-selected',
      'true'
    );
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('shows recursive live-window and live-tab statistics for a collapsed Chromium tree', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await expect(leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`)).toBeVisible();
    const totalNodes = (await leftPane.getByRole('treeitem').count()) - 1;
    const liveWindows = await leftPane.locator('[data-node-id^="explore-window-"]').count();
    const liveTabs = await leftPane.locator('[data-node-id^="explore-tab-"]').count();
    expect(totalNodes).toBeGreaterThan(0);
    expect(liveWindows).toBeGreaterThan(0);
    expect(liveTabs).toBeGreaterThan(0);

    const root = leftPane.locator('[data-node-id="explore-root"]');
    await root.getByRole('button', { name: 'Collapse node' }).click();
    const summary = root.getByRole('button', {
      name: `Hidden: ${totalNodes} nodes, ${liveWindows} live windows, ${liveTabs} live tabs`
    });
    await expect(summary).toContainText(`▣${liveWindows}`);
    await expect(summary).toContainText(`●${liveTabs}`);
    await summary.click();
    await expect(leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`)).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('keeps the complete live hierarchy current and retains it when Chromium closes the window', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    const initialState = await expect
      .poll(() => readPersistentLiveWindow(session.serviceWorker, state.sourceWindowId))
      .not.toBeNull()
      .then(() => readPersistentLiveWindow(session.serviceWorker, state.sourceWindowId));
    if (!initialState) {
      throw new Error('The source Chromium window did not receive a durable live shadow.');
    }
    const sourcePersistentTab = initialState.tabs.find((tab) => tab.browserTabId === state.sourceTabId);
    if (!sourcePersistentTab) {
      throw new Error('The source Chromium tab did not receive a durable live shadow.');
    }

    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceRow = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    await sourceRow.evaluate((element) => element.setAttribute('data-render-instance', 'preserved'));
    const childTabId = await session.serviceWorker.evaluate(
      async ({ windowId, openerTabId, url }) => {
        const tab = await chrome.tabs.create({ windowId, openerTabId, url, active: true });
        if (tab.id === undefined) {
          throw new Error('Chromium did not create the opener-child test tab.');
        }
        return tab.id;
      },
      { windowId: state.sourceWindowId, openerTabId: state.sourceTabId, url: targetUrl }
    );
    const childRow = leftPane.locator(`[data-node-id="explore-tab-${childTabId}"]`);
    await expect(childRow).toBeVisible();
    await expect(sourceRow).toHaveAttribute('data-render-instance', 'preserved');
    await expect(childRow.locator('span.truncate')).toHaveClass(/font-bold/u);
    await expect
      .poll(() => readPersistentTabParent(session.serviceWorker, childTabId))
      .toBe(sourcePersistentTab.persistentId);

    await session.serviceWorker.evaluate((tabId) => chrome.tabs.update(tabId, { active: true }), state.sourceTabId);
    await expect(sourceRow.locator('span.truncate')).toHaveClass(/font-bold/u);
    await expect(childRow.locator('span.truncate')).not.toHaveClass(/font-bold/u);
    await expect(sourceRow).toHaveAttribute('data-render-instance', 'preserved');

    await session.serviceWorker.evaluate((windowId) => chrome.windows.remove(windowId), state.sourceWindowId);
    await expect(sourceRow).toHaveCount(0);
    const savedWindow = leftPane.locator(
      `[data-node-id="explore-saved-window-${initialState.persistentId}"]`
    );
    await expect(savedWindow).toBeVisible();
    await expect(savedWindow.locator('..').locator('[data-node-id^="explore-saved-tab-"]')).toHaveCount(2);
    await expect
      .poll(() => readPersistentWindowBinding(session.serviceWorker, initialState.persistentId))
      .toBe('saved');
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('manages tabs, windows, groups, notes, and separators', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();

    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceLink = leftPane.getByRole('link', { name: 'Browser Atlas E2E Source' });
    await expect(sourceLink).toBeVisible();

    await sourceLink.dblclick();
    await expect
      .poll(() => readTabState(session.serviceWorker, state.sourceTabId))
      .toEqual({
        active: true,
        matchingUrlTabCount: 1,
        windowId: state.sourceWindowId,
        windowFocused: true
      });

    await session.page.bringToFront();
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    await rightPane.getByRole('tab', { name: 'Explore' }).click();

    const sourceRow = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const targetWindowRow = rightPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`);
    await expect(sourceRow).toBeVisible();
    await expect(targetWindowRow).toBeVisible();

    await sourceRow.dragTo(targetWindowRow, { targetPosition: { x: 48, y: 10 } });
    await expect
      .poll(() => readTabState(session.serviceWorker, state.sourceTabId))
      .toEqual({
        active: false,
        matchingUrlTabCount: 1,
        windowId: state.targetWindowId,
        windowFocused: false
      });

    const undo = leftPane.getByTitle('Undo the latest persistent tree change');
    const redo = leftPane.getByTitle('Redo the latest undone persistent tree change');
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(async () => (await readTabState(session.serviceWorker, state.sourceTabId)).windowId)
      .not.toBe(state.targetWindowId);
    const undoneWindowId = (await readTabState(session.serviceWorker, state.sourceTabId)).windowId;
    await expect.poll(() => readAttachedTabState(session.serviceWorker)).toMatchObject({ windowId: undoneWindowId });
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(() => readTabState(session.serviceWorker, state.sourceTabId)).toMatchObject({
      windowId: state.targetWindowId
    });

    const movedSourceRow = rightPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    if ((await targetWindowRow.getAttribute('aria-expanded')) === 'false') {
      await targetWindowRow.getByRole('button', { name: 'Expand node' }).click();
    }
    await expect(movedSourceRow).toBeVisible();
    await movedSourceRow.getByRole('button', { name: 'Close and save Browser Atlas E2E Source' }).click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);

    const savedTabRow = leftPane.locator('[data-node-id^="explore-saved-tab-"]');
    await expect(savedTabRow).toContainText('Browser Atlas E2E Source');
    await session.page.reload();
    await expect(savedTabRow).toContainText('Browser Atlas E2E Source');

    await savedTabRow.getByRole('button', { name: 'Restore Browser Atlas E2E Source' }).click();
    await expect
      .poll(() => readControlledTabsState(session.serviceWorker))
      .toEqual({
        sameWindow: true,
        sourceCount: 1,
        targetCount: 1,
        windowId: state.targetWindowId
      });
    await expect(savedTabRow).toHaveCount(0);

    const restoredTargetWindowRow = leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`);
    await restoredTargetWindowRow.click();
    await acceptNextPrompt(session.page, 'Retained window context', () =>
      leftPane.getByTitle('Create a saved note').click()
    );
    await restoredTargetWindowRow.getByTitle('Close this window and keep its tabs in Browser Atlas').click();
    await expect
      .poll(() => readControlledTabsState(session.serviceWorker))
      .toEqual({
        sameWindow: false,
        sourceCount: 0,
        targetCount: 0,
        windowId: null
      });

    const savedWindowRow = leftPane.locator('[data-node-id^="explore-saved-window-"]');
    await expect(savedWindowRow).toBeVisible();
    await savedWindowRow.getByTitle('Restore this saved window').click();
    await expect
      .poll(() => readControlledTabsState(session.serviceWorker))
      .toMatchObject({
        sameWindow: true,
        sourceCount: 1,
        targetCount: 1
      });
    await expect(savedWindowRow).toHaveCount(0);
    const retainedWindowContext = leftPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Retained window context' });
    await expect(retainedWindowContext).toBeVisible();

    await leftPane.locator('[data-node-id="explore-root"]').click();
    await acceptNextPrompt(session.page, 'E2E research', () => leftPane.getByTitle('Create a saved group').click());
    const savedGroupRows = leftPane.locator('[data-node-id^="explore-saved-group-"]');
    const researchGroupRow = savedGroupRows.filter({ hasText: 'E2E research' });
    await expect(researchGroupRow).toBeVisible();
    await researchGroupRow.click();

    await acceptNextPrompt(session.page, 'E2E note', () => leftPane.getByTitle('Create a saved note').click());
    await leftPane.getByTitle('Create a saved separator').click();
    const savedNoteRow = leftPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'E2E note' });
    const savedSeparatorRow = leftPane.locator('[data-node-id^="explore-saved-separator-"]');
    await expect(savedNoteRow).toContainText('E2E note');
    await expect(savedSeparatorRow).toBeVisible();

    await savedNoteRow.click();
    await acceptNextPrompt(session.page, 'Renamed E2E note', () => savedNoteRow.press('F2'));
    await expect(savedNoteRow).toContainText('Renamed E2E note');
    const initialSeparatorText = await savedSeparatorRow.textContent();
    await savedSeparatorRow.getByRole('button', { name: /Change style/u }).click();
    await expect(savedSeparatorRow).not.toHaveText(initialSeparatorText ?? '');

    await session.page.reload();
    await expect(researchGroupRow).toBeVisible();
    await expect(savedNoteRow).toContainText('Renamed E2E note');
    await expect(savedSeparatorRow).toBeVisible();
    await expect
      .poll(() => readSavedOrganizerState(session.serviceWorker))
      .toEqual({
        rootKinds: ['window', 'window', 'group'],
        groups: [
          {
            title: 'E2E research',
            nestedKinds: ['note', 'separator'],
            noteTexts: ['Renamed E2E note'],
            separatorStyles: [1]
          }
        ]
      });

    const savedItemsRow = leftPane.locator('[data-node-id="explore-saved-items"]');
    await savedItemsRow.click();
    await acceptNextPrompt(session.page, 'E2E archive', () => leftPane.getByTitle('Create a saved group').click());
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const rightResearchGroupRow = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'E2E research' });
    const rightArchiveGroupRow = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'E2E archive' });
    await expect(rightArchiveGroupRow).toBeVisible();

    await savedNoteRow.dragTo(rightArchiveGroupRow, { targetPosition: { x: 48, y: 10 } });
    await savedSeparatorRow.dragTo(rightArchiveGroupRow, { targetPosition: { x: 48, y: 10 } });
    const rightSavedNoteRow = rightPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Renamed E2E note' });
    const rightSavedSeparatorRow = rightPane.locator('[data-node-id^="explore-saved-separator-"]');
    await rightSavedSeparatorRow.dragTo(rightSavedNoteRow, { targetPosition: { x: 48, y: 2 } });
    await expect
      .poll(() => readSavedOrganizerState(session.serviceWorker))
      .toEqual({
        rootKinds: ['window', 'window', 'group', 'group'],
        groups: [
          {
            title: 'E2E research',
            nestedKinds: [],
            noteTexts: [],
            separatorStyles: []
          },
          {
            title: 'E2E archive',
            nestedKinds: ['separator', 'note'],
            noteTexts: ['Renamed E2E note'],
            separatorStyles: [1]
          }
        ]
      });

    await acceptNextConfirmation(session.page, () =>
      rightSavedNoteRow.getByRole('button', { name: 'Delete Renamed E2E note' }).click()
    );
    await expect(savedNoteRow).toHaveCount(0);

    await leftPane.getByRole('button', { name: 'Close and save Browser Atlas E2E Source' }).click();
    const nestedSavedTabRow = leftPane.locator('[data-node-id^="explore-saved-tab-"]');
    await nestedSavedTabRow.dragTo(rightResearchGroupRow, { targetPosition: { x: 48, y: 10 } });

    const controlledTabs = await readControlledTabsState(session.serviceWorker);
    if (controlledTabs.windowId === null) {
      throw new Error('The controlled target window disappeared before it could be saved.');
    }
    const liveTargetWindowRow = leftPane.locator(`[data-node-id="explore-window-${controlledTabs.windowId}"]`);
    await liveTargetWindowRow.getByTitle('Close this window and keep its tabs in Browser Atlas').click();
    const nestedSavedWindowRow = leftPane.locator('[data-node-id^="explore-saved-window-"]');
    await nestedSavedWindowRow.dragTo(rightArchiveGroupRow, { targetPosition: { x: 48, y: 10 } });
    await rightArchiveGroupRow.dragTo(rightResearchGroupRow, { targetPosition: { x: 48, y: 2 } });
    await expect
      .poll(() => readSavedOrganizerState(session.serviceWorker))
      .toEqual({
        rootKinds: ['group', 'window', 'group'],
        groups: [
          {
            title: 'E2E archive',
            nestedKinds: ['separator', 'window'],
            noteTexts: [],
            separatorStyles: [1]
          },
          {
            title: 'E2E research',
            nestedKinds: ['tab'],
            noteTexts: [],
            separatorStyles: []
          }
        ]
      });

    const rightNestedSavedWindowRow = rightPane.locator('[data-node-id^="explore-saved-window-"]');
    await rightNestedSavedWindowRow.dragTo(rightSavedSeparatorRow, { targetPosition: { x: 48, y: 10 } });
    await expect
      .poll(() => hasPersistentParentChild(session.serviceWorker, 'separator', 'window'))
      .toBe(true);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    const video = session.page.video();
    await session.context.close();
    if (video) {
      await testInfo.attach('Browser Atlas Chromium run', {
        path: await video.path(),
        contentType: 'video/webm'
      });
    }
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('preserves notes attached to tabs closed by Chrome', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createAttachedTabBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceRow = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    await expect(sourceRow).toBeVisible();
    await sourceRow.click();
    await acceptNextPrompt(session.page, 'Attached E2E context', () =>
      leftPane.getByTitle('Create a saved note').click()
    );
    await expect
      .poll(() => readAttachedTabState(session.serviceWorker))
      .toEqual({ binding: 'live', noteText: 'Attached E2E context', windowId: state.sourceWindowId });
    await expect(sourceRow.getByRole('button', { name: /Protected/u })).toBeVisible();

    await session.serviceWorker.evaluate(
      ({ tabId, windowId }) => chrome.tabs.move(tabId, { windowId, index: -1 }),
      { tabId: state.sourceTabId, windowId: state.targetWindowId }
    );
    await expect
      .poll(() => readAttachedTabState(session.serviceWorker))
      .toEqual({ binding: 'live', noteText: 'Attached E2E context', windowId: state.targetWindowId });
    await session.page.reload();
    await expect(sourceRow.getByRole('button', { name: /Protected/u })).toBeVisible();
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Attached E2E context' })
    ).toBeVisible();

    await session.serviceWorker.evaluate((tabId) => chrome.tabs.remove(tabId), state.sourceTabId);
    await expect
      .poll(() => readAttachedTabState(session.serviceWorker))
      .toEqual({ binding: 'saved', noteText: 'Attached E2E context', windowId: null });
    const savedTab = leftPane
      .locator('[data-node-id^="explore-saved-tab-"]')
      .filter({ hasText: 'Browser Atlas E2E Source' });
    const attachedNote = leftPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Attached E2E context' });
    await expect(savedTab).toBeVisible();
    await expect(savedTab.getByRole('button', { name: 'Collapse node' })).toBeVisible();
    await expect(attachedNote).toBeVisible();
    await session.page.reload();
    await expect(savedTab).toBeVisible();
    await expect(attachedNote).toBeVisible();
    await savedTab.getByRole('button', { name: 'Restore Browser Atlas E2E Source' }).click();
    await expect
      .poll(() => readAttachedTabState(session.serviceWorker))
      .toMatchObject({ binding: 'live', noteText: 'Attached E2E context' });
    const restoredTab = leftPane.locator('[data-node-id^="explore-tab-"]').filter({
      hasText: 'Browser Atlas E2E Source'
    });
    await expect(restoredTab.getByRole('button', { name: /Protected/u })).toBeVisible();
    await expect(attachedNote).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('keeps custom live and saved window titles in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const liveWindow = leftPane.locator(`[data-node-id="explore-window-${state.sourceWindowId}"]`);

    await selectTreeRow(liveWindow);
    await acceptNextPrompt(session.page, 'Chromium research desk', () => liveWindow.press('F2'));
    await expect(liveWindow).toContainText('Chromium research desk');
    await session.page.reload();
    await expect(liveWindow).toContainText('Chromium research desk');

    await liveWindow.getByTitle('Close this window and keep its tabs in Browser Atlas').click();
    const savedWindowByTitle = leftPane
      .locator('[data-node-id^="explore-saved-window-"]')
      .filter({ hasText: 'Chromium research desk' });
    await expect(savedWindowByTitle).toBeVisible();
    const savedWindowNodeId = await savedWindowByTitle.getAttribute('data-node-id');
    if (!savedWindowNodeId) {
      throw new Error('The saved window did not expose a stable tree node ID.');
    }
    const savedWindow = leftPane.locator(`[data-node-id="${savedWindowNodeId}"]`);
    await leftPane.getByTitle('Undo the latest persistent tree change').click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(1);
    await expect(savedWindow).toHaveCount(0);
    await leftPane.getByTitle('Redo the latest undone persistent tree change').click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
    await expect(savedWindow).toBeVisible();
    await selectTreeRow(savedWindow);
    await acceptNextPrompt(session.page, 'Archived Chromium desk', () => savedWindow.press('F2'));
    await expect(savedWindow).toContainText('Archived Chromium desk');
    await session.page.reload();
    await expect(savedWindow).toContainText('Archived Chromium desk');

    await savedWindow.getByTitle('Restore this saved window').click();
    await expect
      .poll(() => readPersistentWindowTitleState(session.serviceWorker, savedWindowNodeId))
      .toMatchObject({ title: 'Archived Chromium desk', customTitle: true, state: 'live' });
    const restoredWindowState = await readPersistentWindowTitleState(session.serviceWorker, savedWindowNodeId);
    if (!restoredWindowState || restoredWindowState.windowId === null) {
      throw new Error('The renamed window did not restore with a live browser binding.');
    }
    await session.serviceWorker.evaluate((windowId) => chrome.windows.remove(windowId), restoredWindowState.windowId);
    await expect
      .poll(() => readPersistentWindowTitleState(session.serviceWorker, savedWindowNodeId))
      .toEqual({
        title: 'Archived Chromium desk',
        customTitle: true,
        state: 'saved',
        windowId: null,
        tabUrls: [sourceUrl]
      });
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('restores a saved Chromium window at its retained position and size', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    const retainedBounds = await session.serviceWorker.evaluate(async (windowId) => {
      await chrome.windows.update(windowId, { left: 120, top: 100, width: 700, height: 600 });
      const browserWindow = await chrome.windows.get(windowId);
      return {
        left: browserWindow.left ?? 0,
        top: browserWindow.top ?? 0,
        width: browserWindow.width ?? 0,
        height: browserWindow.height ?? 0
      };
    }, state.sourceWindowId);
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await leftPane
      .locator(`[data-node-id="explore-window-${state.sourceWindowId}"]`)
      .getByTitle('Close this window and keep its tabs in Browser Atlas')
      .click();
    const savedWindow = leftPane
      .locator('[data-node-id^="explore-saved-window-"]')
      .filter({ hasText: 'Browser Atlas E2E Source' });
    await expect(savedWindow).toBeVisible();
    const savedWindowNodeId = await savedWindow.getAttribute('data-node-id');
    if (!savedWindowNodeId) {
      throw new Error('The retained-bounds window did not expose a stable tree node ID.');
    }
    await expect.poll(() => readPersistentWindowBoundsState(session.serviceWorker, savedWindowNodeId)).toEqual({
      state: 'saved',
      windowId: null,
      bounds: retainedBounds
    });

    await savedWindow.getByTitle('Restore this saved window').click();
    await expect.poll(() => readPersistentWindowBoundsState(session.serviceWorker, savedWindowNodeId)).toMatchObject({
      state: 'live',
      bounds: retainedBounds
    });
    const restoredState = await readPersistentWindowBoundsState(session.serviceWorker, savedWindowNodeId);
    if (!restoredState || restoredState.windowId === null) {
      throw new Error('The retained-bounds window did not restore with a live browser binding.');
    }
    const restoredWindowId = restoredState.windowId;
    await expect.poll(() => readChromeWindowBounds(session.serviceWorker, restoredWindowId)).toEqual(retainedBounds);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('supports inline tab notes and note shorthands in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);

    await selectTreeRow(liveTab);
    await acceptNextPrompt(session.page, 'Chromium inline context', () => liveTab.press('F2'));
    await expect
      .poll(() => readAttachedTabState(session.serviceWorker))
      .toMatchObject({ binding: 'live', noteText: 'Chromium inline context' });

    const root = leftPane.locator('[data-node-id="explore-root"]');
    await selectTreeRow(root);
    await acceptNextPrompt(session.page, '2G Chromium shortcut group', () =>
      leftPane.getByTitle('Create a saved note').click()
    );
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Chromium shortcut group' })
    ).toBeVisible();

    await selectTreeRow(root);
    await acceptNextPrompt(session.page, '====', () => leftPane.getByTitle('Create a saved note').click());
    await expect.poll(() => readChromeRootLabels(session.serviceWorker)).toContain('separator:1');
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('uses expanded versus collapsed deletion semantics and exact Undo/Redo in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');
    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Delete wrapper', () => leftPane.getByTitle('Create a saved group').click());
    const group = leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Delete wrapper' });
    await selectTreeRow(group);
    for (const title of ['Delete child A', 'Delete child B']) {
      await acceptNextPrompt(session.page, title, () => leftPane.getByTitle('Create a saved note').click());
    }

    await selectTreeRow(group);
    await group.press('Delete');
    await expect.poll(() => readChromeRootLabels(session.serviceWorker)).toEqual(
      expect.arrayContaining(['Delete child A', 'Delete child B'])
    );
    await expect.poll(() => readChromeRootLabels(session.serviceWorker)).not.toContain('Delete wrapper');

    await leftPane.getByTitle('Undo the latest persistent tree change').click();
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Delete wrapper')).toEqual([
      'Delete child A',
      'Delete child B'
    ]);
    await leftPane.getByTitle('Redo the latest undone persistent tree change').click();
    await expect.poll(() => readChromeRootLabels(session.serviceWorker)).not.toContain('Delete wrapper');
    await leftPane.getByTitle('Undo the latest persistent tree change').click();
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Delete wrapper')).toEqual([
      'Delete child A',
      'Delete child B'
    ]);

    await group.getByRole('button', { name: 'Collapse node' }).click();
    await selectTreeRow(group);
    await group.press('Delete');
    await expect.poll(() => readChromeRootLabels(session.serviceWorker)).not.toEqual(
      expect.arrayContaining(['Delete wrapper', 'Delete child A', 'Delete child B'])
    );

    await leftPane.getByTitle('Undo the latest persistent tree change').click();
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Delete wrapper')).toEqual([
      'Delete child A',
      'Delete child B'
    ]);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('promotes or removes inline context when deleting live Chromium tabs', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    const collapsedTabId = await createSiblingTab(session.serviceWorker, state.sourceWindowId);
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    await selectTreeRow(sourceTab);
    await acceptNextPrompt(session.page, 'Promoted Chromium context', () => sourceTab.press('F2'));
    const promotedNote = leftPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Promoted Chromium context' });
    await expect(promotedNote).toBeVisible();

    await sourceTab.getByRole('button', { name: 'Delete Browser Atlas E2E Source' }).click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
    await expect(promotedNote).toBeVisible();
    await leftPane.getByTitle('Undo the latest persistent tree change').click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(1);
    await leftPane.getByTitle('Redo the latest undone persistent tree change').click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
    await session.page.reload();
    await expect(promotedNote).toBeVisible();

    const collapsedTab = leftPane.locator(`[data-node-id="explore-tab-${collapsedTabId}"]`);
    await selectTreeRow(collapsedTab);
    await acceptNextPrompt(session.page, 'Discarded Chromium context', () => collapsedTab.press('F2'));
    const discardedNote = leftPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Discarded Chromium context' });
    await expect(discardedNote).toBeVisible();
    await collapsedTab.getByRole('button', { name: 'Collapse node' }).click();
    await collapsedTab.getByRole('button', { name: /Delete/ }).click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, `${testServerOrigin}/sibling`)).toBe(0);
    await session.page.reload();
    await expect(discardedNote).toHaveCount(0);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('keeps a live tab inside a saved note across Chrome moves and reloads', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createAttachedTabBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });

    await leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`).click();
    await acceptNextPrompt(session.page, 'Organized live work', () =>
      leftPane.getByTitle('Create a saved note').click()
    );
    await rightPane.getByRole('tab', { name: 'Explore' }).click();

    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const organizer = rightPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Organized live work' });
    await liveTab.dragTo(organizer, { targetPosition: { x: 48, y: 10 } });
    await expect
      .poll(() => readOrganizedLiveTab(session.serviceWorker, 'Organized live work', state.sourceTabId))
      .toEqual({ state: 'live', windowId: state.sourceWindowId });

    await session.serviceWorker.evaluate(
      ({ tabId, windowId }) => chrome.tabs.move(tabId, { windowId, index: -1 }),
      { tabId: state.sourceTabId, windowId: state.targetWindowId }
    );
    await expect
      .poll(() => readOrganizedLiveTab(session.serviceWorker, 'Organized live work', state.sourceTabId))
      .toEqual({ state: 'live', windowId: state.targetWindowId });

    await session.page.reload();
    await expect(leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`)).toBeVisible();
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-tab-"]').filter({ hasText: 'Browser Atlas E2E Source' })
    ).toHaveCount(0);

    await session.serviceWorker.evaluate((windowId) => chrome.windows.remove(windowId), state.targetWindowId);
    await expect
      .poll(() => readOrganizedLiveTab(session.serviceWorker, 'Organized live work', state.sourceTabId))
      .toEqual({ state: 'saved', windowId: null });
    await session.page.reload();
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-tab-"]').filter({ hasText: 'Browser Atlas E2E Source' })
    ).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('save-closes only the selected Chromium tab while its nested window is expanded', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createAttachedTabBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const nestedWindow = leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`);
    await nestLiveWindowUnderTab(nestedWindow);
    await expect(sourceTab.getByRole('button', { name: 'Collapse node' })).toBeVisible();

    await sourceTab.getByRole('button', { name: /Close and save/ }).click();

    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
    await expect.poll(() => isChromeWindowOpen(session.serviceWorker, state.targetWindowId)).toBe(true);
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { windowId: state.targetWindowId }, targetUrl))
      .toMatchObject({ windowId: state.targetWindowId, live: 1, saved: 0 });
    await leftPane.getByTitle('Undo the latest persistent tree change').click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(1);
    await leftPane.getByTitle('Redo the latest undone persistent tree change').click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('save-closes every Chromium descendant hidden beneath a collapsed tab', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createAttachedTabBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const nestedWindow = leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`);
    await nestLiveWindowUnderTab(nestedWindow);
    const nestedWindowState = await readChromePersistentWindowTabState(
      session.serviceWorker,
      { windowId: state.targetWindowId },
      targetUrl
    );
    expect(nestedWindowState.persistentId).not.toBe('');

    await sourceTab.getByRole('button', { name: 'Collapse node' }).click();
    await sourceTab.click({ button: 'right' });
    const menu = session.page.getByRole('menu', { name: 'Tree commands' });
    await expect(menu.getByRole('menuitem', { name: 'Save & Close hierarchy' })).toBeVisible();
    await menu.press('Escape');
    await selectTreeRow(sourceTab);
    await sourceTab.press('Backspace');

    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
    await expect.poll(() => isChromeWindowOpen(session.serviceWorker, state.targetWindowId)).toBe(false);
    await expect
      .poll(() =>
        readChromePersistentWindowTabState(
          session.serviceWorker,
          { persistentId: nestedWindowState.persistentId },
          targetUrl
        )
      )
      .toMatchObject({ windowId: null, live: 0, saved: 1 });
    await session.page.reload();
    await expect(leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`)).toHaveCount(0);
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-tab-"]').filter({ hasText: 'Browser Atlas E2E Source' }).first()
    ).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('opens a saved group as a real Chromium window', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;
  let restoredWindowId: number | undefined;

  try {
    browserState = await createTestBrowserState(session.serviceWorker);
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await leftPane.locator('[data-node-id="explore-root"]').click();
    await acceptNextPrompt(session.page, 'Chromium window group', () =>
      leftPane.getByTitle('Create a saved group').click()
    );

    const savedGroup = leftPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Chromium window group' });
    const treeNodeId = await savedGroup.getAttribute('data-node-id');
    if (!treeNodeId) {
      throw new Error('The created Chromium group has no persistent node ID.');
    }
    await selectTreeRow(savedGroup);
    await savedGroup.press('Space');

    await expect
      .poll(() => readPersistentWindowTitleState(session.serviceWorker, treeNodeId))
      .toMatchObject({ title: 'Chromium window group', customTitle: true, state: 'live' });
    const restoredState = await readPersistentWindowTitleState(session.serviceWorker, treeNodeId);
    restoredWindowId = restoredState?.windowId ?? undefined;
    expect(restoredWindowId).toBeDefined();
    expect(restoredState?.tabUrls).toContain('about:blank');
    await expect(leftPane.locator(`[data-node-id="explore-window-${restoredWindowId}"]`)).toContainText(
      'Chromium window group'
    );

    await session.page.reload();
    await expect
      .poll(() => readPersistentWindowTitleState(session.serviceWorker, treeNodeId))
      .toMatchObject({ title: 'Chromium window group', customTitle: true, state: 'live', windowId: restoredWindowId });
  } finally {
    if (restoredWindowId !== undefined) {
      await removeWindowIfPresent(session.serviceWorker, restoredWindowId);
    }
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('turns a saved group into a real Chromium window when a live tab is dropped inside', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    await leftPane.locator('[data-node-id="explore-root"]').click();
    await acceptNextPrompt(session.page, 'Dropped Chromium tab', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    await rightPane.getByRole('tab', { name: 'Explore' }).click();

    const savedGroup = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Dropped Chromium tab' });
    const treeNodeId = await savedGroup.getAttribute('data-node-id');
    if (!treeNodeId) {
      throw new Error('The created Chromium group has no persistent node ID.');
    }
    await leftPane
      .locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`)
      .dragTo(savedGroup, { targetPosition: { x: 48, y: 10 } });

    await expect
      .poll(() => readPersistentWindowTitleState(session.serviceWorker, treeNodeId))
      .toMatchObject({ title: 'Dropped Chromium tab', customTitle: true, state: 'live' });
    const restoredState = await readPersistentWindowTitleState(session.serviceWorker, treeNodeId);
    expect(restoredState?.windowId).not.toBeNull();
    expect(restoredState?.windowId).not.toBe(state.sourceWindowId);
    await expect.poll(() => readTabState(session.serviceWorker, state.sourceTabId).then((tab) => tab.windowId)).toBe(
      restoredState?.windowId
    );

    await session.page.reload();
    await expect
      .poll(() => readPersistentWindowTitleState(session.serviceWorker, treeNodeId))
      .toMatchObject({ title: 'Dropped Chromium tab', customTitle: true, state: 'live' });
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('creates precisely placed organizers by dragging the toolbar tools in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const liveTab = rightPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);

    await acceptNextPrompt(session.page, 'Dragged Chromium group', () =>
      leftPane.getByRole('button', { name: 'Group', exact: true }).dragTo(liveTab, { targetPosition: { x: 48, y: 10 } })
    );
    await expect.poll(() => readChromeLiveTabChildLabels(session.serviceWorker, state.sourceTabId)).toContain(
      'Dragged Chromium group'
    );

    const group = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Dragged Chromium group' });
    await acceptNextPrompt(session.page, 'Dragged Chromium note', () =>
      leftPane.getByRole('button', { name: 'Note', exact: true }).dragTo(group, { targetPosition: { x: 48, y: 10 } })
    );
    const note = rightPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'Dragged Chromium note' });
    await leftPane.getByRole('button', { name: 'Rule', exact: true }).dragTo(note, { targetPosition: { x: 48, y: 2 } });

    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Dragged Chromium group')).toEqual([
      'separator:0',
      'Dragged Chromium note'
    ]);
    await session.page.reload();
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Dragged Chromium group')).toEqual([
      'separator:0',
      'Dragged Chromium note'
    ]);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('creates a live Chromium window where the Window toolbar tool is dropped', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;
  let createdWindowId: number | null = null;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');
    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Window fabric destination', () =>
      leftPane.getByTitle('Create a saved group; drag it to place it precisely').click()
    );
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const destination = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Window fabric destination' });
    const previousWindowIds = await session.serviceWorker.evaluate(async () =>
      (await chrome.windows.getAll()).flatMap((browserWindow) =>
        browserWindow.id === undefined ? [] : [browserWindow.id]
      )
    );

    await leftPane
      .getByRole('button', { name: 'Window', exact: true })
      .dragTo(destination, { targetPosition: { x: 48, y: 10 } });
    const detectedWindowId = await expect
      .poll(() => findNewWindowId(session.serviceWorker, previousWindowIds))
      .not.toBeNull()
      .then(() => findNewWindowId(session.serviceWorker, previousWindowIds));
    if (detectedWindowId === null) {
      throw new Error('Dragging the Window tool did not create a Chromium window.');
    }
    createdWindowId = detectedWindowId;
    await expect
      .poll(() => readChromeWindowParentLabel(session.serviceWorker, detectedWindowId))
      .toBe('Window fabric destination');

    await session.page.bringToFront();
    const createdWindow = rightPane.locator(`[data-node-id="explore-window-${detectedWindowId}"]`);
    await expect(createdWindow).toBeVisible();
    await session.page.reload();
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    await expect(createdWindow).toBeVisible();
    await expect
      .poll(() => readChromeWindowParentLabel(session.serviceWorker, detectedWindowId))
      .toBe('Window fabric destination');
  } finally {
    if (createdWindowId !== null) {
      await removeWindowIfPresent(session.serviceWorker, createdWindowId);
    }
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('creates and naturally retains a protected Google Doc from the Doc toolbar tool', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let createdWindowId: number | null = null;

  try {
    await session.context.route('https://docs.google.com/document/create', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Untitled document</title>' })
    );
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');
    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Document fabric destination', () =>
      leftPane.getByTitle('Create a saved group; drag it to place it precisely').click()
    );
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const destination = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Document fabric destination' });

    await leftPane
      .getByRole('button', { name: 'Doc', exact: true })
      .dragTo(destination, { targetPosition: { x: 48, y: 10 } });
    await expect.poll(() => readChromeGoogleDocState(session.serviceWorker)).toMatchObject({
      parentTitle: 'Document fabric destination',
      state: 'live',
      keepOnClose: true
    });
    const liveState = await readChromeGoogleDocState(session.serviceWorker);
    if (!liveState || liveState.tabId === null || liveState.windowId === null) {
      throw new Error('The Google Doc fabric did not expose a live Chromium tab.');
    }
    createdWindowId = liveState.windowId;
    await session.page.bringToFront();
    const liveDocumentRow = rightPane.locator(`[data-node-id="explore-tab-${liveState.tabId}"]`);
    await expect(liveDocumentRow.getByRole('button', { name: 'Protected leaf node' })).toBeVisible();
    await expect(liveDocumentRow.locator('span.truncate')).toHaveClass(/text-blue-400/u);

    await session.serviceWorker.evaluate((windowId) => chrome.windows.remove(windowId), liveState.windowId);
    await expect.poll(() => readChromeGoogleDocState(session.serviceWorker)).toMatchObject({
      parentTitle: 'Document fabric destination',
      state: 'saved',
      keepOnClose: true
    });

    await session.page.bringToFront();
    await session.page.reload();
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const retainedDocumentRow = rightPane.locator('[data-node-id^="explore-saved-tab-"]').filter({
      hasText: 'Untitled document'
    });
    await expect(retainedDocumentRow).toBeVisible();
    await expect(retainedDocumentRow.getByRole('button', { name: 'Leaf node' })).toBeVisible();
    await expect(retainedDocumentRow.locator('span.truncate')).toHaveClass(/text-blue-400/u);
  } finally {
    if (createdWindowId !== null) {
      await removeWindowIfPresent(session.serviceWorker, createdWindowId);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('persists Chromium settings and applies one-click activation to a real saved tab', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await session.page.getByRole('button', { name: 'Settings' }).click();
    await session.page.getByLabel('Follow the focused browser window').uncheck();
    await session.page.getByLabel('Activate with one click').check();
    await session.page.getByLabel('Open Browser Atlas on startup').check();
    await session.page.getByLabel('Use light background').check();
    await setColorInput(session.page, 'Active tab color', '#112233');
    await session.page.getByLabel('Override active tab color').check();
    await expect(session.page.locator('main')).toHaveAttribute('data-browser-atlas-theme', 'light');
    await expect(
      leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"] span.truncate`).first()
    ).toHaveCSS('color', 'rgb(17, 34, 51)');
    await session.page.getByRole('button', { name: 'Settings' }).click();
    await expect.poll(() => readChromeSettings(session.serviceWorker)).toEqual({
      autoFollowFocusedWindow: false,
      oneClickActivation: true,
      openOnStartup: true,
      nestNewTabsUnderOpener: true,
      restoreWindowsInOriginalBounds: true,
      appearance: {
        lightBackground: true,
        savedTab: { enabled: false, color: '#606060' },
        openTab: { enabled: false, color: '#9CB7D3' },
        activeTab: { enabled: true, color: '#112233' },
        note: { enabled: false, color: '#DAD2B4' }
      }
    });

    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    await liveTab.getByRole('button', { name: /Close and save/ }).click();
    const savedLink = leftPane.locator(`[data-node-id^="explore-saved-tab-"] a[href="${sourceUrl}"]`);
    await expect(savedLink).toBeVisible();
    await savedLink.click();
    await expect.poll(() => readTabWindowIdsByUrl(session.serviceWorker, sourceUrl)).toHaveLength(1);

    await session.page.reload();
    await session.page.getByRole('button', { name: 'Settings' }).click();
    await expect(session.page.getByLabel('Follow the focused browser window')).not.toBeChecked();
    await expect(session.page.getByLabel('Activate with one click')).toBeChecked();
    await expect(session.page.getByLabel('Open Browser Atlas on startup')).toBeChecked();
    await expect(session.page.getByLabel('Nest new tabs under their opener')).toBeChecked();
    await expect(session.page.getByLabel('Restore saved window position and size')).toBeChecked();
    await expect(session.page.getByLabel('Use light background')).toBeChecked();
    await expect(session.page.getByLabel('Override active tab color')).toBeChecked();
    await expect(session.page.getByLabel('Active tab color', { exact: true })).toHaveValue('#112233');
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('liberates a live Chromium tab into a new window by dropping it on the Explore root', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);

    await selectTreeRow(liveTab);
    await acceptNextPrompt(session.page, 'Liberated Chromium context', () => liveTab.press('F2'));
    await liveTab.dragTo(rightPane.locator('[data-node-id="explore-root"]'), {
      targetPosition: { x: 48, y: 10 }
    });

    await expect
      .poll(async () => {
        const attachedState = await readAttachedTabState(session.serviceWorker);
        return (
          attachedState.binding === 'live' &&
          attachedState.noteText === 'Liberated Chromium context' &&
          attachedState.windowId !== null &&
          attachedState.windowId !== state.sourceWindowId &&
          attachedState.windowId !== state.targetWindowId
        );
      })
      .toBe(true);
    const liberatedWindowId = (await readAttachedTabState(session.serviceWorker)).windowId;
    if (
      liberatedWindowId === null ||
      liberatedWindowId === state.sourceWindowId ||
      liberatedWindowId === state.targetWindowId
    ) {
      throw new Error(`Expected a new Chromium window, received ${String(liberatedWindowId)}.`);
    }
    await expect
      .poll(() => readTabState(session.serviceWorker, state.sourceTabId))
      .toMatchObject({ matchingUrlTabCount: 1, windowId: liberatedWindowId });

    await session.page.bringToFront();
    const liberatedWindow = leftPane.locator(`[data-node-id="explore-window-${liberatedWindowId}"]`);
    await expect(liberatedWindow).toBeVisible();
    await expect(liveTab).toBeVisible();
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Liberated Chromium context' })
    ).toBeVisible();

    await session.page.reload();
    await expect(liberatedWindow).toBeVisible();
    await expect
      .poll(() => readAttachedTabState(session.serviceWorker))
      .toEqual({ binding: 'live', noteText: 'Liberated Chromium context', windowId: liberatedWindowId });
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('restores a saved tab into the window where it is dropped', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createAttachedTabBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });

    await leftPane
      .locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`)
      .getByRole('button', { name: 'Close and save Browser Atlas E2E Source' })
      .click();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);
    await rightPane.getByRole('tab', { name: 'Explore' }).click();

    const savedTab = leftPane
      .locator('[data-node-id^="explore-saved-tab-"]')
      .filter({ hasText: 'Browser Atlas E2E Source' });
    const targetWindow = rightPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`);
    await savedTab.dragTo(targetWindow, { targetPosition: { x: 48, y: 10 } });

    await expect
      .poll(() => readTabByUrl(session.serviceWorker, sourceUrl))
      .toEqual({ count: 1, windowId: state.targetWindowId });
    await expect(savedTab).toHaveCount(0);
    await session.page.reload();
    await expect(leftPane.getByRole('link', { name: 'Browser Atlas E2E Source' })).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('opens a new Chromium window from the explorer toolbar', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let createdWindowId: number | null = null;

  try {
    const previousWindowIds = await session.serviceWorker.evaluate(async () =>
      (await chrome.windows.getAll()).flatMap((browserWindow) =>
        browserWindow.id === undefined ? [] : [browserWindow.id]
      )
    );
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await leftPane.getByTitle('Open a new browser window').click();

    createdWindowId = await expect
      .poll(() => findNewWindowId(session.serviceWorker, previousWindowIds))
      .not.toBeNull()
      .then(() => findNewWindowId(session.serviceWorker, previousWindowIds));
    if (createdWindowId === null) {
      throw new Error('Chromium did not expose the newly created window.');
    }
    await session.page.bringToFront();
    await expect(leftPane.locator(`[data-node-id="explore-window-${createdWindowId}"]`)).toBeVisible();
  } finally {
    if (createdWindowId !== null) {
      await session.serviceWorker.evaluate((windowId) => chrome.windows.remove(windowId), createdWindowId);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('browses and selectively restores local Chromium tree snapshots', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);

  try {
    await session.serviceWorker.evaluate(() => chrome.storage.local.clear());
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');
    await session.page.bringToFront();
    await root.click();
    await session.page.keyboard.press('Control+b');
    await expect.poll(() => countLocalTreeSnapshots(session.serviceWorker)).toBe(1);
    await root.click();
    await acceptNextPrompt(session.page, 'Temporary Chromium backup test', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    const temporaryGroup = leftPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Temporary Chromium backup test' });
    await expect(temporaryGroup).toBeVisible();

    await leftPane.getByTitle('Create a local tree snapshot').click();
    await expect.poll(() => countLocalTreeSnapshots(session.serviceWorker)).toBe(2);
    await root.click();
    await acceptNextPrompt(session.page, 'Second Chromium backup test', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    const secondTemporaryGroup = leftPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Second Chromium backup test' });
    await expect(secondTemporaryGroup).toBeVisible();

    await leftPane.getByTitle('Browse and restore local tree snapshots').click();
    const history = leftPane.getByRole('dialog', { name: 'Local backup history' });
    const entries = history.locator('li[data-created-at]');
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText(/\d+ nodes?/u);

    await entries.first().getByRole('button', { name: /Open backup from/u }).click();
    await expect(
      leftPane.getByRole('combobox', { name: 'Explorer data source' }).locator('option:checked')
    ).toContainText('Local backup');
    await expect(leftPane.getByText('Temporary Chromium backup test', { exact: true })).toBeVisible();
    await expect(leftPane.getByText('Second Chromium backup test', { exact: true })).toHaveCount(0);

    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    await expect(rightPane.getByText('Second Chromium backup test', { exact: true })).toBeVisible();
    await rightPane.getByTitle('Browse and restore local tree snapshots').click();
    const rightHistory = rightPane.getByRole('dialog', { name: 'Local backup history' });
    await acceptNextConfirmation(session.page, () =>
      rightHistory.getByRole('button', { name: /Restore backup from/u }).nth(1).click()
    );
    await expect(rightPane.getByText('Temporary Chromium backup test', { exact: true })).toHaveCount(0);
    await expect(rightPane.getByText('Second Chromium backup test', { exact: true })).toHaveCount(0);
    await expect(rightHistory.locator('li[data-created-at]')).toHaveCount(1);
    await expect.poll(() => countLocalTreeSnapshots(session.serviceWorker)).toBe(1);
    await session.page.reload();
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    await expect(rightPane.getByText('Temporary Chromium backup test', { exact: true })).toHaveCount(0);
  } finally {
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('imports external text and links into Chrome persistent storage', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createAttachedTabBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const sourceTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const transfer = await dispatchDragWrite(sourceTab);
    expect(transfer['text/uri-list']).toBe(sourceUrl);
    expect(transfer['text/plain']).toContain('Browser Atlas E2E Source');
    expect(transfer['text/plain']).not.toContain('browser-atlas-transfer:v2');
    expect(transfer['text/html']).toContain('<!--browser-atlas-transfer:v2');
    expect(transfer['application/json']).toContain('browser-atlas-transfer');

    await dropExternalData(sourceTab, { 'text/plain': 'External Chromium context' });
    const importedNote = leftPane
      .locator('[data-node-id^="explore-saved-note-"]')
      .filter({ hasText: 'External Chromium context' });
    await expect(importedNote).toBeVisible();

    await dropExternalData(importedNote, {
      'text/uri-list': 'https://example.com/chromium-reference',
      'text/plain': 'https://example.com/chromium-reference',
      'text/html': '<a href="https://example.com/chromium-reference">Chromium reference title</a>'
    });
    await expect
      .poll(() => hasStoredNoteWithTab(session.serviceWorker, 'External Chromium context', 'https://example.com/chromium-reference'))
      .toBe(true);

    await dropExternalData(importedNote, { 'text/html': transfer['text/html'] ?? '' });
    await expect
      .poll(() => hasStoredNoteWithTab(session.serviceWorker, 'External Chromium context', sourceUrl))
      .toBe(true);

    await session.page.reload();
    await expect(importedNote).toBeVisible();
    await expect(
      leftPane.locator('[data-node-id^="explore-saved-tab-"]').filter({ hasText: 'Chromium reference title' })
    ).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('opens an original Tabs Outliner tree export in the Chromium document pane', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);

  try {
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    await leftPane.locator('input[type="file"]').setInputFiles({
      name: 'legacy-tabs-outliner.tree',
      mimeType: 'application/json',
      buffer: await readFile(new URL('./fixtures/legacy-tabs-outliner.tree', import.meta.url))
    });

    const legacyWindow = leftPane.locator('[data-node-id="explore-document-node-1"]');
    await expect(legacyWindow).toContainText('Legacy research window');
    await legacyWindow.getByRole('button', { name: 'Expand node' }).click();
    await expect(leftPane.getByRole('link', { name: 'Legacy project page' })).toHaveAttribute(
      'href',
      'https://example.com/legacy-project'
    );
    await expect(leftPane.locator('[data-node-id="explore-document-node-4"]')).toContainText('Imported legacy note');
    await expect(
      leftPane.locator('[data-node-id="explore-document-node-6"] span.truncate').first()
    ).toHaveCSS('color', 'rgb(52, 96, 170)');
  } finally {
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('browses and selectively restores deleted Chromium hierarchies', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);

  try {
    await session.serviceWorker.evaluate(() => chrome.storage.local.clear());
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');

    await root.click();
    await acceptNextPrompt(session.page, 'First deleted Chromium group', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    await root.click();
    await acceptNextPrompt(session.page, 'Second deleted Chromium group', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    const firstGroup = leftPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'First deleted Chromium group' });
    const secondGroup = leftPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Second deleted Chromium group' });

    await acceptNextConfirmation(session.page, () =>
      firstGroup.getByRole('button', { name: 'Delete First deleted Chromium group' }).click()
    );
    await acceptNextConfirmation(session.page, () =>
      secondGroup.getByRole('button', { name: 'Delete Second deleted Chromium group' }).click()
    );
    await leftPane.getByTitle('Browse and restore deleted hierarchies').click();

    const history = leftPane.getByRole('dialog', { name: 'Deleted items history' });
    const entries = history.locator('li[data-deletion-id]');
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText('Second deleted Chromium group');
    await expect(entries.nth(1)).toContainText('First deleted Chromium group');

    await acceptNextConfirmation(session.page, () =>
      history.getByRole('button', { name: 'Restore deleted First deleted Chromium group' }).click()
    );
    await expect(firstGroup).toBeVisible();
    await expect(secondGroup).toHaveCount(0);
    await expect(entries).toHaveCount(1);
    await session.page.reload();
    await expect(firstGroup).toBeVisible();
  } finally {
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('copies, cuts, and pastes saved hierarchies through the context menu in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');

    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Clipboard research', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    const group = leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Clipboard research' });
    await selectTreeRow(group);
    await acceptNextPrompt(session.page, 'Clipboard destination', () =>
      leftPane.getByTitle('Create a saved note').click()
    );
    const note = leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Clipboard destination' });
    await expect(note).toBeVisible();

    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const menu = session.page.getByRole('menu', { name: 'Tree commands' });
    await liveTab.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /Copy hierarchy/ }).click();
    await group.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /Paste as last child/ }).click();

    const savedCopy = leftPane
      .locator('[data-node-id^="explore-saved-tab-"]')
      .filter({ hasText: 'Browser Atlas E2E Source' });
    await expect(savedCopy).toBeVisible();
    await expect(liveTab).toBeVisible();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(1);

    await savedCopy.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /Cut hierarchy/ }).click();
    await expect(savedCopy).toHaveCount(0);
    await note.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /Paste as last child/ }).click();
    await expect
      .poll(() => hasStoredNoteWithTab(session.serviceWorker, 'Clipboard destination', sourceUrl))
      .toBe(true);
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(1);

    await session.page.reload();
    await expect
      .poll(() => hasStoredNoteWithTab(session.serviceWorker, 'Clipboard destination', sourceUrl))
      .toBe(true);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('copies a complete persistent hierarchy with Alt-drag in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    browserState = await createTestBrowserState(session.serviceWorker);
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');

    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Drag copy source', () => leftPane.getByTitle('Create a saved group').click());
    const source = leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Drag copy source' });
    await selectTreeRow(source);
    await acceptNextPrompt(session.page, 'Copied nested note', () => leftPane.getByTitle('Create a saved note').click());
    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Drag copy destination', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    await rightPane.getByRole('tab', { name: 'Explore' }).click();
    const destination = rightPane
      .locator('[data-node-id^="explore-saved-group-"]')
      .filter({ hasText: 'Drag copy destination' });

    await copyDragTo(session.page, source, destination);

    await expect.poll(() => readChromeRootLabels(session.serviceWorker)).toEqual(
      expect.arrayContaining(['Drag copy source', 'Drag copy destination'])
    );
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Drag copy destination')).toContain(
      'Drag copy source'
    );
    await expect.poll(() => countChromeNodesByLabel(session.serviceWorker, 'Drag copy source')).toBe(2);
    await expect.poll(() => countChromeNodesByLabel(session.serviceWorker, 'Copied nested note')).toBe(2);

    await session.page.reload();
    await expect.poll(() => countChromeNodesByLabel(session.serviceWorker, 'Drag copy source')).toBe(2);
    await expect.poll(() => countChromeNodesByLabel(session.serviceWorker, 'Copied nested note')).toBe(2);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('restores only the latest saved Chromium window session with Alt activation', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const liveWindow = leftPane.locator(`[data-node-id="explore-window-${state.sourceWindowId}"]`);
    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    const menu = session.page.getByRole('menu', { name: 'Tree commands' });

    await liveTab.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /Copy hierarchy/ }).click();
    await liveWindow.click({ button: 'right' });
    await menu.getByRole('menuitem', { name: /Paste as last child/ }).click();
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { windowId: state.sourceWindowId }, sourceUrl))
      .toMatchObject({ live: 1, saved: 1 });
    const initialPersistentState = await readChromePersistentWindowTabState(
      session.serviceWorker,
      { windowId: state.sourceWindowId },
      sourceUrl
    );
    const persistentId = initialPersistentState.persistentId;

    await liveWindow.getByRole('button', { name: /Close and save/ }).click();
    const savedWindow = leftPane.locator(`[data-node-id="explore-saved-window-${persistentId}"]`);
    await expect(savedWindow).toBeVisible();
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { persistentId }, sourceUrl))
      .toMatchObject({ live: 0, saved: 2 });
    await savedWindow.dblclick({ modifiers: ['Alt'] });
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { persistentId }, sourceUrl))
      .toMatchObject({ live: 1, saved: 1 });
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(1);

    const restoredState = await readChromePersistentWindowTabState(
      session.serviceWorker,
      { persistentId },
      sourceUrl
    );
    if (restoredState.windowId === null) {
      throw new Error('Alt Restore did not bind the persistent window to Chromium.');
    }
    const restoredWindow = leftPane.locator(`[data-node-id="explore-window-${restoredState.windowId}"]`);
    await restoredWindow.getByRole('button', { name: /Close and save/ }).click();
    await expect(savedWindow).toBeVisible();
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { persistentId }, sourceUrl))
      .toMatchObject({ live: 0, saved: 2 });
    await selectTreeRow(savedWindow);
    await savedWindow.press('Alt+Space');
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { persistentId }, sourceUrl))
      .toMatchObject({ live: 1, saved: 1 });
    const keyboardRestoredState = await readChromePersistentWindowTabState(
      session.serviceWorker,
      { persistentId },
      sourceUrl
    );
    if (keyboardRestoredState.windowId === null) {
      throw new Error('Keyboard Alt Restore did not bind the persistent window to Chromium.');
    }
    const keyboardRestoredWindow = leftPane.locator(
      `[data-node-id="explore-window-${keyboardRestoredState.windowId}"]`
    );
    await keyboardRestoredWindow.getByRole('button', { name: /Close and save/ }).click();
    await expect(savedWindow).toBeVisible();
    await selectTreeRow(savedWindow);
    await savedWindow.press(' ');
    await expect
      .poll(() => readChromePersistentWindowTabState(session.serviceWorker, { persistentId }, sourceUrl))
      .toMatchObject({ live: 2, saved: 0 });
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(2);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('opens a saved Chromium link in a new or last window without restoring it', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const liveTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    await liveTab.getByRole('button', { name: 'Close and save Browser Atlas E2E Source' }).click();
    const savedTab = leftPane
      .locator('[data-node-id^="explore-saved-tab-"]')
      .filter({ hasText: 'Browser Atlas E2E Source' });
    const savedLink = savedTab.getByRole('link', { name: 'Browser Atlas E2E Source' });
    await expect(savedTab).toBeVisible();
    await expect.poll(() => countTabsWithUrl(session.serviceWorker, sourceUrl)).toBe(0);

    await savedLink.click({ modifiers: ['Shift'] });
    await expect.poll(() => readTabWindowIdsByUrl(session.serviceWorker, sourceUrl)).toHaveLength(1);
    const [firstOpenedTabId] = await readTabIdsByUrl(session.serviceWorker, sourceUrl);
    if (firstOpenedTabId === undefined) {
      throw new Error('Shift+Click did not create the first Chromium tab.');
    }
    const firstWindowIds = await readTabWindowIdsByUrl(session.serviceWorker, sourceUrl);
    const openedWindowId = firstWindowIds[0];
    if (openedWindowId === undefined) {
      throw new Error('Shift+Click did not create a Chromium window.');
    }
    await expect(savedTab).toBeVisible();

    await savedLink.click({ modifiers: [CLIPBOARD_MODIFIER] });
    await expect.poll(() => readTabWindowIdsByUrl(session.serviceWorker, sourceUrl)).toEqual([
      openedWindowId,
      openedWindowId
    ]);
    const secondOpenedTabId = (await readTabIdsByUrl(session.serviceWorker, sourceUrl)).find(
      (tabId) => tabId !== firstOpenedTabId
    );
    if (secondOpenedTabId === undefined) {
      throw new Error('Modifier-click did not create the second Chromium tab.');
    }
    await expect.poll(() => readChromeLiveParent(session.serviceWorker, secondOpenedTabId)).toEqual({
      kind: 'tab',
      browserId: firstOpenedTabId
    });
    await savedLink.click({ button: 'middle' });
    await expect.poll(() => readTabWindowIdsByUrl(session.serviceWorker, sourceUrl)).toEqual([
      openedWindowId,
      openedWindowId,
      openedWindowId
    ]);
    const thirdOpenedTabId = (await readTabIdsByUrl(session.serviceWorker, sourceUrl)).find(
      (tabId) => tabId !== firstOpenedTabId && tabId !== secondOpenedTabId
    );
    if (thirdOpenedTabId === undefined) {
      throw new Error('Middle-click did not create the third Chromium tab.');
    }
    await expect.poll(() => readChromeLiveParent(session.serviceWorker, thirdOpenedTabId)).toEqual({
      kind: 'tab',
      browserId: secondOpenedTabId
    });
    await expect(savedTab).toBeVisible();
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('searches, prints, and exports visible rows in the Chromium extension', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const rightPane = session.page.getByRole('region', { name: 'Right explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');

    await root.focus();
    await root.press('c');
    await expect(rightPane.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
    await expect(rightPane.getByRole('link', { name: 'Browser Atlas E2E Source' })).toBeVisible();

    await root.focus();
    await root.press(`${CLIPBOARD_MODIFIER}+f`);
    const search = leftPane.getByRole('searchbox', { name: 'Find visible nodes' });
    await search.fill('Browser Atlas E2E Source');
    await expect(leftPane.getByRole('status')).toHaveText('1 / 1');
    await expect(leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`)).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await search.press('Escape');

    await session.page.evaluate(() => {
      const browser = globalThis as unknown as {
        print: () => void;
        document: { querySelector: (selector: string) => { textContent: string | null } | null };
        sessionStorage: { setItem: (key: string, value: string) => void };
      };
      browser.print = () => {
        browser.sessionStorage.setItem(
          'browserAtlas.e2e.printText',
          browser.document.querySelector('[data-browser-atlas-print]')?.textContent ?? ''
        );
      };
    });
    await root.focus();
    await root.press(`${CLIPBOARD_MODIFIER}+p`);
    const printText = await session.page.evaluate(() => {
      const browser = globalThis as unknown as { sessionStorage: { getItem: (key: string) => string | null } };
      return browser.sessionStorage.getItem('browserAtlas.e2e.printText') ?? '';
    });
    expect(printText).toContain('Browser Atlas E2E Source');

    const downloadPromise = session.page.waitForEvent('download');
    await root.press(`${CLIPBOARD_MODIFIER}+s`);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Chrome-explore.html');
    const downloadPath = await download.path();
    if (!downloadPath) {
      throw new Error('Playwright did not expose the Chromium HTML export path.');
    }
    const html = await readFile(downloadPath, 'utf8');
    expect(html).toContain('<title>Chrome · Explore</title>');
    expect(html).toContain('id="browser-atlas-document"');
    expect(html).toContain('Browser Atlas E2E Source');
    expect(html).toContain(sourceUrl);

    await leftPane.locator('input[type="file"]').setInputFiles({
      name: 'Chrome-explore.html',
      mimeType: 'text/html',
      buffer: Buffer.from(html)
    });
    await expect(
      leftPane.getByRole('combobox', { name: 'Explorer data source' }).locator('option:checked')
    ).toContainText('Chrome-explore.html');
    await expect(leftPane.getByRole('link', { name: 'Browser Atlas E2E Source' })).toHaveAttribute('href', sourceUrl);
    await expect.poll(() => leftPane.locator('[data-node-id^="explore-document-node-"]').count()).toBeGreaterThanOrEqual(4);
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('supports original organizer placement shortcuts in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');

    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Placement group', () =>
      leftPane.getByTitle('Create a saved group').click()
    );
    const group = leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Placement group' });
    await selectTreeRow(group);
    await acceptNextPrompt(session.page, 'Anchor note', () =>
      leftPane.getByTitle('Create a saved note').click()
    );
    const anchor = leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Anchor note' });

    await pressExtensionOrganizerShortcut(session.page, anchor, 'Shift+Enter', 'Before anchor');
    await pressExtensionOrganizerShortcut(session.page, anchor, 'Enter', 'After anchor');
    await pressExtensionOrganizerShortcut(session.page, anchor, 'Insert', 'Last child');
    await pressExtensionOrganizerShortcut(session.page, anchor, 'Alt+Insert', 'First child');

    const sourceTab = leftPane.locator(`[data-node-id="explore-tab-${state.sourceTabId}"]`);
    await pressExtensionOrganizerShortcut(session.page, sourceTab, 'Shift+Alt+Enter', 'Live tab wrapper');
    await pressExtensionOrganizerShortcut(session.page, anchor, 'Alt+Enter', 'Tree ending');

    const targetWindow = leftPane.locator(`[data-node-id="explore-window-${state.targetWindowId}"]`);
    await pressExtensionOrganizerShortcut(session.page, targetWindow, 'Shift+g', 'Group before target');
    await selectTreeRow(targetWindow);
    await targetWindow.press('l');

    await expect.poll(() => readChromePlacementState(session.serviceWorker)).toEqual({
      anchorChildren: ['First child', 'Last child'],
      groupChildren: ['Before anchor', 'Anchor note', 'After anchor'],
      sourceWrapperContainsTab: true,
      treeEndingAtRoot: true,
      targetSiblingOrder: ['Group before target', 'target-window', 'separator:0']
    });

    await session.page.reload();
    await expect.poll(() => readChromePlacementState(session.serviceWorker)).toMatchObject({
      anchorChildren: ['First child', 'Last child'],
      groupChildren: ['Before anchor', 'Anchor note', 'After anchor'],
      sourceWrapperContainsTab: true
    });
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

test('moves persistent and live hierarchies with structural shortcuts in Chromium', async ({}, testInfo) => {
  const session = await launchBrowserAtlas(testInfo);
  let browserState: TestBrowserState | undefined;

  try {
    const state = await createTestBrowserState(session.serviceWorker);
    browserState = state;
    const siblingTabId = await createSiblingTab(session.serviceWorker, state.sourceWindowId);
    await session.page.reload();
    const leftPane = session.page.getByRole('region', { name: 'Left explorer pane' });
    const root = leftPane.locator('[data-node-id="explore-root"]');

    await selectTreeRow(root);
    await acceptNextPrompt(session.page, 'Move group', () => leftPane.getByTitle('Create a saved group').click());
    const group = leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Move group' });
    await selectTreeRow(group);
    for (const title of ['Move A', 'Move B', 'Move C']) {
      await acceptNextPrompt(session.page, title, () => leftPane.getByTitle('Create a saved note').click());
    }
    const noteB = leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Move B' });

    await selectTreeRow(noteB);
    await noteB.press('Control+End');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move A',
      'Move C',
      'Move B'
    ]);
    await selectTreeRow(noteB);
    await noteB.press('Control+Home');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move B',
      'Move A',
      'Move C'
    ]);
    await selectTreeRow(noteB);
    await noteB.press('Control+ArrowDown');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move A',
      'Move B',
      'Move C'
    ]);
    await selectTreeRow(noteB);
    await noteB.press('Control+ArrowUp');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move B',
      'Move A',
      'Move C'
    ]);
    await selectTreeRow(noteB);
    await noteB.press('Control+ArrowDown');

    await selectTreeRow(noteB);
    await noteB.press('Tab');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move A')).toEqual(['Move B']);
    await selectTreeRow(noteB);
    await noteB.press('Shift+Tab');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move A',
      'Move B',
      'Move C'
    ]);
    await selectTreeRow(noteB);
    await noteB.press('Control+ArrowRight');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move A')).toEqual(['Move B']);
    await selectTreeRow(noteB);
    await noteB.press('Control+ArrowLeft');
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move A',
      'Move B',
      'Move C'
    ]);

    const siblingTab = leftPane.locator(`[data-node-id="explore-tab-${siblingTabId}"]`);
    await selectTreeRow(siblingTab);
    await siblingTab.press('Tab');
    await expect
      .poll(() => readChromeLiveParent(session.serviceWorker, siblingTabId))
      .toEqual({ kind: 'tab', browserId: state.sourceTabId });
    const sourceWindow = leftPane.locator(`[data-node-id="explore-window-${state.sourceWindowId}"]`);
    await selectTreeRow(sourceWindow);
    await sourceWindow.press('/');
    await expect
      .poll(() => readChromeLiveParent(session.serviceWorker, siblingTabId))
      .toEqual({ kind: 'window', browserId: state.sourceWindowId });
    await selectTreeRow(siblingTab);
    await siblingTab.press('Control+ArrowRight');
    await expect
      .poll(() => readChromeLiveParent(session.serviceWorker, siblingTabId))
      .toEqual({ kind: 'tab', browserId: state.sourceTabId });
    await selectTreeRow(siblingTab);
    await siblingTab.press('Shift+Tab');
    await expect
      .poll(() => readChromeLiveParent(session.serviceWorker, siblingTabId))
      .toEqual({ kind: 'window', browserId: state.sourceWindowId });

    await selectTreeRow(noteB);
    await noteB.press('e');
    await expect.poll(async () => (await readChromeRootLabels(session.serviceWorker)).at(-1)).toBe('Move group');

    await session.page.reload();
    await expect.poll(() => readChromeChildrenByLabel(session.serviceWorker, 'Move group')).toEqual([
      'Move A',
      'Move B',
      'Move C'
    ]);
    await expect
      .poll(() => readChromeLiveParent(session.serviceWorker, siblingTabId))
      .toEqual({ kind: 'window', browserId: state.sourceWindowId });
    await expect.poll(async () => (await readChromeRootLabels(session.serviceWorker)).at(-1)).toBe('Move group');
  } finally {
    if (browserState) {
      await removeTestWindows(session.serviceWorker, browserState);
    }
    await session.context.close();
    await removeTemporaryProfile(session.userDataDirectory);
  }
});

type BrowserAtlasSession = {
  context: BrowserContext;
  page: Page;
  serviceWorker: Worker;
  userDataDirectory: string;
};

async function launchBrowserAtlas(testInfo: TestInfo): Promise<BrowserAtlasSession> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'browser-atlas-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    channel: 'chromium',
    headless: process.env.BROWSER_ATLAS_E2E_HEADED !== '1',
    ...(process.env.BROWSER_ATLAS_E2E_VIDEO === '1' ? { recordVideo: { dir: testInfo.outputPath('videos') } } : {}),
    args: [`--disable-extensions-except=${extensionDirectory}`, `--load-extension=${extensionDirectory}`]
  });

  const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/explorer.html`);
  await expect(page.getByRole('heading', { name: 'Browser Atlas' })).toBeVisible();
  await page.bringToFront();

  return { context, page, serviceWorker, userDataDirectory };
}

type TestBrowserState = {
  sourceTabId: number;
  sourceWindowId: number;
  targetWindowId: number;
};

type PersistentLiveWindowState = Readonly<{
  persistentId: string;
  tabs: readonly Readonly<{ browserTabId: number; persistentId: string }>[];
}>;

async function readPersistentLiveWindow(
  serviceWorker: Worker,
  windowId: number
): Promise<PersistentLiveWindowState | null> {
  return serviceWorker.evaluate(async (browserWindowId) => {
    const storage = await chrome.storage.local.get('browserAtlas.persistentTree.v2');
    const document: unknown = storage['browserAtlas.persistentTree.v2'];
    if (!isRecord(document) || !Array.isArray(document.roots)) {
      return null;
    }
    return findWindow(document.roots);

    function findWindow(nodes: unknown[]): PersistentLiveWindowState | null {
      for (const value of nodes) {
        if (!isRecord(value) || !Array.isArray(value.children)) {
          continue;
        }
        if (
          value.kind === 'window' &&
          typeof value.id === 'string' &&
          isRecord(value.binding) &&
          value.binding.state === 'live' &&
          value.binding.windowId === browserWindowId
        ) {
          return { persistentId: value.id, tabs: collectTabs(value.children) };
        }
        const descendant = findWindow(value.children);
        if (descendant) {
          return descendant;
        }
      }
      return null;
    }

    function collectTabs(nodes: unknown[]): PersistentLiveWindowState['tabs'] {
      return nodes.flatMap((value): PersistentLiveWindowState['tabs'] => {
        if (!isRecord(value) || !Array.isArray(value.children)) {
          return [];
        }
        const descendants = collectTabs(value.children);
        return value.kind === 'tab' &&
          typeof value.id === 'string' &&
          isRecord(value.binding) &&
          value.binding.state === 'live' &&
          typeof value.binding.tabId === 'number'
          ? [{ browserTabId: value.binding.tabId, persistentId: value.id }, ...descendants]
          : descendants;
      });
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
  }, windowId);
}

async function readPersistentTabParent(serviceWorker: Worker, tabId: number): Promise<string | null> {
  return serviceWorker.evaluate(async (browserTabId) => {
    const storage = await chrome.storage.local.get('browserAtlas.persistentTree.v2');
    const document: unknown = storage['browserAtlas.persistentTree.v2'];
    if (!isRecord(document) || !Array.isArray(document.roots)) {
      return null;
    }
    return findParent(document.roots, null);

    function findParent(nodes: unknown[], parentId: string | null): string | null {
      for (const value of nodes) {
        if (!isRecord(value) || !Array.isArray(value.children)) {
          continue;
        }
        if (
          value.kind === 'tab' &&
          isRecord(value.binding) &&
          value.binding.state === 'live' &&
          value.binding.tabId === browserTabId
        ) {
          return parentId;
        }
        const descendant = findParent(value.children, typeof value.id === 'string' ? value.id : parentId);
        if (descendant !== null) {
          return descendant;
        }
      }
      return null;
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
  }, tabId);
}

async function readPersistentWindowBinding(serviceWorker: Worker, persistentId: string): Promise<string | null> {
  return serviceWorker.evaluate(async (windowNodeId) => {
    const storage = await chrome.storage.local.get('browserAtlas.persistentTree.v2');
    const document: unknown = storage['browserAtlas.persistentTree.v2'];
    if (!isRecord(document) || !Array.isArray(document.roots)) {
      return null;
    }
    return findBinding(document.roots);

    function findBinding(nodes: unknown[]): string | null {
      for (const value of nodes) {
        if (!isRecord(value) || !Array.isArray(value.children)) {
          continue;
        }
        if (
          value.kind === 'window' &&
          value.id === windowNodeId &&
          isRecord(value.binding) &&
          typeof value.binding.state === 'string'
        ) {
          return value.binding.state;
        }
        const descendant = findBinding(value.children);
        if (descendant !== null) {
          return descendant;
        }
      }
      return null;
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
  }, persistentId);
}

async function createTestBrowserState(serviceWorker: Worker): Promise<TestBrowserState> {
  return serviceWorker.evaluate(
    async ({ sourceUrl: source, targetUrl: target }) => {
      await chrome.storage.local.clear();
      const sourceWindow = await chrome.windows.create({ focused: false, type: 'normal', url: source });
      const targetWindow = await chrome.windows.create({ focused: false, type: 'normal', url: target });

      if (!sourceWindow || !targetWindow) {
        throw new Error('Chromium did not return the isolated Browser Atlas test windows.');
      }

      const sourceWindowId = sourceWindow.id;
      const targetWindowId = targetWindow.id;
      const sourceTabId = sourceWindow.tabs?.[0]?.id;

      if (sourceWindowId === undefined || targetWindowId === undefined || sourceTabId === undefined) {
        throw new Error('Chromium did not create the isolated Browser Atlas test windows.');
      }

      return { sourceTabId, sourceWindowId, targetWindowId };
    },
    { sourceUrl, targetUrl }
  );
}

async function createSiblingTab(serviceWorker: Worker, windowId: number): Promise<number> {
  return serviceWorker.evaluate(
    async ({ targetWindowId, url }) => {
      const tab = await chrome.tabs.create({ windowId: targetWindowId, url, active: false });
      if (tab.id === undefined) {
        throw new Error('Chromium did not create the structural-move sibling tab.');
      }
      return tab.id;
    },
    { targetWindowId: windowId, url: `${testServerOrigin}/sibling` }
  );
}

async function createAttachedTabBrowserState(serviceWorker: Worker): Promise<TestBrowserState> {
  return serviceWorker.evaluate(
    async ({ source, target }) => {
      await chrome.storage.local.clear();
      const sourceWindow = await chrome.windows.create({ focused: false, type: 'normal', url: [source, target] });
      const targetWindow = await chrome.windows.create({ focused: false, type: 'normal', url: target });
      const sourceWindowId = sourceWindow?.id;
      const targetWindowId = targetWindow?.id;
      const sourceTab = sourceWindow?.tabs?.[0];
      if (sourceWindowId === undefined || targetWindowId === undefined || sourceTab?.id === undefined) {
        throw new Error('Chromium did not create the attached-context test tabs.');
      }
      return { sourceTabId: sourceTab.id, sourceWindowId, targetWindowId };
    },
    { source: sourceUrl, target: targetUrl }
  );
}

type TestTabState = {
  active: boolean;
  matchingUrlTabCount: number;
  windowId: number;
  windowFocused: boolean;
};

async function readTabState(serviceWorker: Worker, tabId: number): Promise<TestTabState> {
  return serviceWorker.evaluate(
    async ({ source, tab }) => {
      const currentTab = await chrome.tabs.get(tab);
      const currentWindow = await chrome.windows.get(currentTab.windowId);
      const matchingUrlTabCount = (await chrome.tabs.query({})).filter((candidate) => candidate.url === source).length;
      return {
        active: currentTab.active,
        matchingUrlTabCount,
        windowId: currentTab.windowId,
        windowFocused: currentWindow.focused
      };
    },
    { source: sourceUrl, tab: tabId }
  );
}

async function countTabsWithUrl(serviceWorker: Worker, url: string): Promise<number> {
  return serviceWorker.evaluate(
    async (targetUrl) => (await chrome.tabs.query({})).filter((tab) => tab.url === targetUrl).length,
    url
  );
}

async function isChromeWindowOpen(serviceWorker: Worker, windowId: number): Promise<boolean> {
  return serviceWorker.evaluate(async (targetWindowId) => {
    try {
      await chrome.windows.get(targetWindowId);
      return true;
    } catch {
      return false;
    }
  }, windowId);
}

async function nestLiveWindowUnderTab(windowRow: Locator): Promise<void> {
  await selectTreeRow(windowRow);
  await windowRow.press('Tab');
  await selectTreeRow(windowRow);
  await windowRow.press('Control+ArrowUp');
  await selectTreeRow(windowRow);
  await windowRow.press('Tab');
}

async function readTabWindowIdsByUrl(serviceWorker: Worker, url: string): Promise<number[]> {
  return serviceWorker.evaluate(
    async (targetUrl) => (await chrome.tabs.query({})).flatMap((tab) => tab.url === targetUrl ? [tab.windowId] : []),
    url
  );
}

async function readTabIdsByUrl(serviceWorker: Worker, url: string): Promise<number[]> {
  return serviceWorker.evaluate(
    async (targetUrl) => (await chrome.tabs.query({})).flatMap((tab) => tab.url === targetUrl && tab.id !== undefined ? [tab.id] : []),
    url
  );
}

type PersistentWindowLookup =
  | Readonly<{ persistentId: string }>
  | Readonly<{ windowId: number }>;

type PersistentWindowTabState = Readonly<{
  persistentId: string;
  windowId: number | null;
  live: number;
  saved: number;
}>;

async function readChromePersistentWindowTabState(
  serviceWorker: Worker,
  lookup: PersistentWindowLookup,
  url: string
): Promise<PersistentWindowTabState> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedLookup, expectedUrl }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return emptyState();
      }
      const window = findWindow(document.roots);
      if (typeof window !== 'object' || window === null || !('id' in window) || typeof window.id !== 'string') {
        return emptyState();
      }
      return {
        persistentId: window.id,
        windowId: readLiveWindowId(window),
        ...countBindings(childrenOf(window))
      };

      function findWindow(nodes: unknown[]): unknown {
        for (const node of nodes) {
          if (matchesWindow(node)) {
            return node;
          }
          const descendant = findWindow(childrenOf(node));
          if (descendant !== undefined) {
            return descendant;
          }
        }
        return undefined;
      }

      function matchesWindow(node: unknown): boolean {
        if (typeof node !== 'object' || node === null || !('kind' in node) || node.kind !== 'window') {
          return false;
        }
        if ('persistentId' in expectedLookup) {
          return 'id' in node && node.id === expectedLookup.persistentId;
        }
        return readLiveWindowId(node) === expectedLookup.windowId;
      }

      function countBindings(nodes: unknown[]): { live: number; saved: number } {
        let live = 0;
        let saved = 0;
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null) {
            continue;
          }
          const descendants = countBindings(childrenOf(node));
          live += descendants.live;
          saved += descendants.saved;
          if ('kind' in node && node.kind === 'tab' && 'url' in node && node.url === expectedUrl) {
            if ('binding' in node && readBindingState(node.binding) === 'live') {
              live += 1;
            } else {
              saved += 1;
            }
          }
        }
        return { live, saved };
      }

      function readLiveWindowId(node: object): number | null {
        if (!('binding' in node) || typeof node.binding !== 'object' || node.binding === null) {
          return null;
        }
        return readBindingState(node.binding) === 'live' &&
          'windowId' in node.binding &&
          typeof node.binding.windowId === 'number'
          ? node.binding.windowId
          : null;
      }

      function readBindingState(binding: unknown): string | undefined {
        return typeof binding === 'object' && binding !== null && 'state' in binding && typeof binding.state === 'string'
          ? binding.state
          : undefined;
      }

      function childrenOf(node: unknown): unknown[] {
        return typeof node === 'object' && node !== null && 'children' in node && Array.isArray(node.children)
          ? node.children
          : [];
      }

      function emptyState(): PersistentWindowTabState {
        return { persistentId: '', windowId: null, live: 0, saved: 0 };
      }
    },
    { storageKey: 'browserAtlas.persistentTree.v2', expectedLookup: lookup, expectedUrl: url }
  );
}

async function readTabByUrl(serviceWorker: Worker, url: string): Promise<Readonly<{ count: number; windowId: number | null }>> {
  return serviceWorker.evaluate(async (expectedUrl) => {
    const tabs = await chrome.tabs.query({ url: expectedUrl });
    return { count: tabs.length, windowId: tabs[0]?.windowId ?? null };
  }, url);
}

async function findNewWindowId(serviceWorker: Worker, previousWindowIds: readonly number[]): Promise<number | null> {
  return serviceWorker.evaluate(async (knownWindowIds) => {
    const known = new Set(knownWindowIds);
    return (await chrome.windows.getAll()).find((browserWindow) =>
      browserWindow.id !== undefined && !known.has(browserWindow.id)
    )?.id ?? null;
  }, previousWindowIds);
}

async function readChromeSettings(serviceWorker: Worker): Promise<unknown> {
  return serviceWorker.evaluate(async () => {
    const storage = await chrome.storage.local.get('browserAtlas.settings.v1');
    return storage['browserAtlas.settings.v1'] ?? null;
  });
}

async function setColorInput(page: Page, label: string, color: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).evaluate((element, value) => {
    const view = element.ownerDocument.defaultView;
    if (!view || !('value' in element)) {
      throw new Error('Expected a color input.');
    }
    (element as typeof element & { value: string }).value = value;
    element.dispatchEvent(new view.Event('input', { bubbles: true }));
  }, color);
}

async function countLocalTreeSnapshots(serviceWorker: Worker): Promise<number> {
  return serviceWorker.evaluate(async () => {
    const storage = await chrome.storage.local.get('browserAtlas.localTreeSnapshots.v1');
    const snapshots: unknown = storage['browserAtlas.localTreeSnapshots.v1'];
    return Array.isArray(snapshots) ? snapshots.length : 0;
  });
}

async function readBrowserActionStatistics(serviceWorker: Worker): Promise<Readonly<{
  badgeMatchesTabCount: boolean;
  titleMatchesCounts: boolean;
}>> {
  return serviceWorker.evaluate(async () => {
    const browserWindows = await chrome.windows.getAll({ populate: true });
    const tabCount = browserWindows.reduce(
      (total, browserWindow) => total + (browserWindow.tabs?.length ?? 0),
      0
    );
    const [badge, title] = await Promise.all([
      chrome.action.getBadgeText({}),
      chrome.action.getTitle({})
    ]);
    return {
      badgeMatchesTabCount: badge === String(tabCount),
      titleMatchesCounts: title === `${browserWindows.length} windows / ${tabCount} tabs · Open Browser Atlas`
    };
  });
}

async function readExplorerWindowTypes(serviceWorker: Worker): Promise<readonly string[]> {
  return serviceWorker.evaluate(async () => {
    const explorerUrl = chrome.runtime.getURL('explorer.html');
    const tabs = await chrome.tabs.query({ url: `${explorerUrl}*` });
    const windowIds = [...new Set(tabs.map((tab) => tab.windowId))];
    return Promise.all(windowIds.map(async (windowId) => (await chrome.windows.get(windowId)).type ?? 'normal'));
  });
}

type ControlledTabsState = {
  sameWindow: boolean;
  sourceCount: number;
  targetCount: number;
  windowId: number | null;
};

async function readControlledTabsState(serviceWorker: Worker): Promise<ControlledTabsState> {
  return serviceWorker.evaluate(
    async ({ source, target }) => {
      const tabs = await chrome.tabs.query({});
      const sourceTabs = tabs.filter((tab) => tab.url === source);
      const targetTabs = tabs.filter((tab) => tab.url === target);
      const sourceWindowId = sourceTabs[0]?.windowId;
      const targetWindowId = targetTabs[0]?.windowId;
      return {
        sameWindow: sourceWindowId !== undefined && targetWindowId !== undefined && sourceWindowId === targetWindowId,
        sourceCount: sourceTabs.length,
        targetCount: targetTabs.length,
        windowId: sourceWindowId ?? targetWindowId ?? null
      };
    },
    { source: sourceUrl, target: targetUrl }
  );
}

type AttachedTabState = Readonly<{
  binding: 'live' | 'saved' | 'crashed' | null;
  noteText: string | null;
  windowId: number | null;
}>;

async function readAttachedTabState(serviceWorker: Worker): Promise<AttachedTabState> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedUrl }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return { binding: null, noteText: null, windowId: null };
      }
      return findAttachedTab(document.roots);

      function findAttachedTab(nodes: unknown[]): AttachedTabState {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('kind' in node) || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (
            node.kind === 'tab' &&
            'url' in node &&
            node.url === expectedUrl &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding
          ) {
            const note = children.find(
              (child) => typeof child === 'object' && child !== null && 'kind' in child && child.kind === 'note'
            );
            return {
              binding:
                node.binding.state === 'live' || node.binding.state === 'saved' || node.binding.state === 'crashed'
                  ? node.binding.state
                  : null,
              windowId:
                node.binding.state === 'live' && 'windowId' in node.binding && typeof node.binding.windowId === 'number'
                  ? node.binding.windowId
                  : null,
              noteText:
                typeof note === 'object' && note !== null && 'text' in note && typeof note.text === 'string'
                  ? note.text
                  : null
            };
          }
          const descendant = findAttachedTab(children);
          if (descendant.binding !== null) {
            return descendant;
          }
        }
        return { binding: null, noteText: null, windowId: null };
      }
    },
    { storageKey: 'browserAtlas.persistentTree.v2', expectedUrl: sourceUrl }
  );
}

async function acceptNextPrompt(page: Page, value: string, action: () => Promise<void>): Promise<void> {
  await action();
  const dialog = page.locator('[data-browser-atlas-operation-dialog]');
  await dialog.locator('input[aria-label="Name"]').fill(value);
  await dialog.getByRole('button', { name: /Create|Rename/u }).click();
}

async function acceptNextConfirmation(page: Page, action: () => Promise<void>): Promise<void> {
  await action();
  const dialog = page.locator('[data-browser-atlas-operation-dialog]');
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.locator('button[type="submit"]').click();
  }
}

async function dropExternalData(target: Locator, values: Readonly<Record<string, string>>): Promise<void> {
  await target.evaluate((element, transferValues) => {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error('The target is not attached to a browser window.');
    }
    const dataTransfer = new view.DataTransfer();
    for (const [type, value] of Object.entries(transferValues)) {
      dataTransfer.setData(type, value);
    }
    const bounds = element.getBoundingClientRect();
    for (const type of ['dragenter', 'dragover', 'drop']) {
      element.dispatchEvent(
        new view.DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
          dataTransfer
        })
      );
    }
  }, values);
}

async function dispatchDragWrite(target: Locator): Promise<Record<string, string>> {
  return target.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error('The drag source is not attached to a browser window.');
    }
    const dataTransfer = new view.DataTransfer();
    element.dispatchEvent(
      new view.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer })
    );
    const values = Object.fromEntries(
      [...dataTransfer.types].map((dataType) => [dataType, dataTransfer.getData(dataType)])
    );
    element.dispatchEvent(
      new view.DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer })
    );
    return values;
  });
}

async function selectTreeRow(target: Locator): Promise<void> {
  await target.focus();
  await target.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error('The tree row is not attached to a browser window.');
    }
    element.dispatchEvent(new view.MouseEvent('click', { bubbles: true }));
  });
  await expect(target).toHaveAttribute('aria-selected', 'true');
  await target.page().waitForTimeout(25);
}

async function copyDragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  await page.keyboard.down('Alt');
  try {
    await source.dragTo(target, { targetPosition: { x: 48, y: 10 } });
  } finally {
    await page.keyboard.up('Alt');
  }
}

async function pressExtensionOrganizerShortcut(
  page: Page,
  target: Locator,
  shortcut: string,
  title: string
): Promise<void> {
  await selectTreeRow(target);
  await acceptNextPrompt(page, title, () => target.press(shortcut));
}

type ChromePlacementState = Readonly<{
  anchorChildren: string[];
  groupChildren: string[];
  sourceWrapperContainsTab: boolean;
  treeEndingAtRoot: boolean;
  targetSiblingOrder: string[];
}>;

async function readChromeWindowParentLabel(serviceWorker: Worker, windowId: number): Promise<string | null> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedWindowId }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return null;
      }
      return findParent(document.roots, null);

      function findParent(nodes: unknown[], parentLabel: string | null): string | null {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('children' in node)) {
            continue;
          }
          if (
            'kind' in node &&
            node.kind === 'window' &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding &&
            node.binding.state === 'live' &&
            'windowId' in node.binding &&
            node.binding.windowId === expectedWindowId
          ) {
            return parentLabel;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          const descendant = findParent(children, labelNode(node));
          if (descendant !== null) {
            return descendant;
          }
        }
        return null;
      }

      function labelNode(node: object): string {
        if ('kind' in node && node.kind === 'note' && 'text' in node && typeof node.text === 'string') {
          return node.text;
        }
        return 'title' in node && typeof node.title === 'string' ? node.title : '';
      }
    },
    { storageKey: 'browserAtlas.persistentTree.v2', expectedWindowId: windowId }
  );
}

type ChromeGoogleDocState = Readonly<{
  parentTitle: string | null;
  state: string;
  keepOnClose: boolean;
  tabId: number | null;
  windowId: number | null;
}>;

async function readChromeGoogleDocState(serviceWorker: Worker): Promise<ChromeGoogleDocState | null> {
  return serviceWorker.evaluate(async ({ storageKey, url }) => {
    const storage = await chrome.storage.local.get(storageKey);
    const document: unknown = storage[storageKey];
    if (!document || typeof document !== 'object' || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }

    function find(nodes: unknown[], parentTitle: string | null): ChromeGoogleDocState | null {
      for (const value of nodes) {
        if (!value || typeof value !== 'object') {
          continue;
        }
        const node = value as {
          title?: unknown;
          url?: unknown;
          keepOnClose?: unknown;
          binding?: unknown;
          children?: unknown;
        };
        const binding = node.binding;
        if (
          node.url === url &&
          binding &&
          typeof binding === 'object' &&
          'state' in binding &&
          typeof binding.state === 'string'
        ) {
          return {
            parentTitle,
            state: binding.state,
            keepOnClose: node.keepOnClose === true,
            tabId: 'tabId' in binding && typeof binding.tabId === 'number' ? binding.tabId : null,
            windowId: 'windowId' in binding && typeof binding.windowId === 'number' ? binding.windowId : null
          };
        }
        if (Array.isArray(node.children)) {
          const descendant = find(node.children, typeof node.title === 'string' ? node.title : parentTitle);
          if (descendant) {
            return descendant;
          }
        }
      }
      return null;
    }

    return find(document.roots, null);
  }, { storageKey: 'browserAtlas.persistentTree.v2', url: 'https://docs.google.com/document/create' });
}

async function readChromeLiveTabChildLabels(serviceWorker: Worker, tabId: number): Promise<string[]> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedTabId }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return [];
      }
      return findChildren(document.roots).map(labelNode);

      function findChildren(nodes: unknown[]): unknown[] {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (
            'kind' in node &&
            node.kind === 'tab' &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding &&
            node.binding.state === 'live' &&
            'tabId' in node.binding &&
            node.binding.tabId === expectedTabId
          ) {
            return children;
          }
          const descendant = findChildren(children);
          if (descendant.length > 0) {
            return descendant;
          }
        }
        return [];
      }

      function labelNode(node: unknown): string {
        if (typeof node !== 'object' || node === null || !('kind' in node)) {
          return 'unknown';
        }
        if (node.kind === 'note' && 'text' in node && typeof node.text === 'string') {
          return node.text;
        }
        if (node.kind === 'separator' && 'style' in node && typeof node.style === 'number') {
          return `separator:${node.style}`;
        }
        return 'title' in node && typeof node.title === 'string' ? node.title : String(node.kind);
      }
    },
    { storageKey: 'browserAtlas.persistentTree.v2', expectedTabId: tabId }
  );
}

async function readChromeChildrenByLabel(serviceWorker: Worker, parentLabel: string): Promise<string[]> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedParentLabel }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return [];
      }
      const parent = findByLabel(document.roots);
      return childrenOf(parent).map(labelNode);

      function findByLabel(nodes: unknown[]): unknown {
        for (const node of nodes) {
          if (labelNode(node) === expectedParentLabel) {
            return node;
          }
          const descendant = findByLabel(childrenOf(node));
          if (descendant !== undefined) {
            return descendant;
          }
        }
        return undefined;
      }

      function childrenOf(node: unknown): unknown[] {
        return typeof node === 'object' && node !== null && 'children' in node && Array.isArray(node.children)
          ? node.children
          : [];
      }

      function labelNode(node: unknown): string {
        if (typeof node !== 'object' || node === null || !('kind' in node)) {
          return 'unknown';
        }
        if (node.kind === 'note' && 'text' in node && typeof node.text === 'string') {
          return node.text;
        }
        if (node.kind === 'separator' && 'style' in node && typeof node.style === 'number') {
          return `separator:${node.style}`;
        }
        return 'title' in node && typeof node.title === 'string' ? node.title : String(node.kind);
      }
    },
    { storageKey: 'browserAtlas.persistentTree.v2', expectedParentLabel: parentLabel }
  );
}

async function readChromeRootLabels(serviceWorker: Worker): Promise<string[]> {
  return serviceWorker.evaluate(async ({ storageKey }) => {
    const storage = await chrome.storage.local.get(storageKey);
    const document: unknown = storage[storageKey];
    if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
      return [];
    }
    return document.roots.map(labelNode);

    function labelNode(node: unknown): string {
      if (typeof node !== 'object' || node === null || !('kind' in node)) {
        return 'unknown';
      }
      if (node.kind === 'note' && 'text' in node && typeof node.text === 'string') {
        return node.text;
      }
      if (node.kind === 'separator' && 'style' in node && typeof node.style === 'number') {
        return `separator:${node.style}`;
      }
      return 'title' in node && typeof node.title === 'string' ? node.title : String(node.kind);
    }
  }, { storageKey: 'browserAtlas.persistentTree.v2' });
}

async function countChromeNodesByLabel(serviceWorker: Worker, label: string): Promise<number> {
  return serviceWorker.evaluate(async ({ storageKey, expectedLabel }) => {
    const storage = await chrome.storage.local.get(storageKey);
    const document: unknown = storage[storageKey];
    if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
      return 0;
    }
    return count(document.roots);

    function count(nodes: unknown[]): number {
      return nodes.reduce<number>((total, node) => {
        if (typeof node !== 'object' || node === null || !('kind' in node) || !('children' in node)) {
          return total;
        }
        const children = Array.isArray(node.children) ? node.children : [];
        return total + (nodeLabel(node) === expectedLabel ? 1 : 0) + count(children);
      }, 0);
    }

    function nodeLabel(node: object & Record<'kind', unknown>): string {
      if (node.kind === 'note' && 'text' in node && typeof node.text === 'string') {
        return node.text;
      }
      return 'title' in node && typeof node.title === 'string' ? node.title : String(node.kind);
    }
  }, { storageKey: 'browserAtlas.persistentTree.v2', expectedLabel: label });
}

type ChromeLiveParent = Readonly<
  | { kind: 'tab' | 'window'; browserId: number }
  | { kind: 'other'; browserId: null }
> | null;

async function readChromeLiveParent(serviceWorker: Worker, tabId: number): Promise<ChromeLiveParent> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedTabId }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return null;
      }
      return findParent(document.roots, null);

      function findParent(nodes: unknown[], parent: unknown): ChromeLiveParent {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('children' in node)) {
            continue;
          }
          if (
            'kind' in node &&
            node.kind === 'tab' &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding &&
            node.binding.state === 'live' &&
            'tabId' in node.binding &&
            node.binding.tabId === expectedTabId
          ) {
            return describeParent(parent);
          }
          const children = Array.isArray(node.children) ? node.children : [];
          const descendant = findParent(children, node);
          if (descendant !== null) {
            return descendant;
          }
        }
        return null;
      }

      function describeParent(parent: unknown): ChromeLiveParent {
        if (
          typeof parent !== 'object' ||
          parent === null ||
          !('kind' in parent) ||
          !('binding' in parent) ||
          typeof parent.binding !== 'object' ||
          parent.binding === null ||
          !('state' in parent.binding) ||
          parent.binding.state !== 'live'
        ) {
          return { kind: 'other', browserId: null };
        }
        if (parent.kind === 'tab' && 'tabId' in parent.binding && typeof parent.binding.tabId === 'number') {
          return { kind: 'tab', browserId: parent.binding.tabId };
        }
        if (parent.kind === 'window' && 'windowId' in parent.binding && typeof parent.binding.windowId === 'number') {
          return { kind: 'window', browserId: parent.binding.windowId };
        }
        return { kind: 'other', browserId: null };
      }
    },
    { storageKey: 'browserAtlas.persistentTree.v2', expectedTabId: tabId }
  );
}

async function readChromePlacementState(serviceWorker: Worker): Promise<ChromePlacementState> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedSourceUrl, expectedTargetUrl }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return emptyState();
      }
      const roots = document.roots;
      const anchor = findByLabel(roots, 'Anchor note');
      const group = findByLabel(roots, 'Placement group');
      const wrapper = findByLabel(roots, 'Live tab wrapper');
      const targetIndex = roots.findIndex((node) => containsUrl(node, expectedTargetUrl));
      return {
        anchorChildren: childrenOf(anchor).map(labelNode),
        groupChildren: childrenOf(group).map(labelNode),
        sourceWrapperContainsTab: containsUrl(wrapper, expectedSourceUrl),
        treeEndingAtRoot: roots.some((node) => labelNode(node) === 'Tree ending'),
        targetSiblingOrder:
          targetIndex < 0
            ? []
            : roots.slice(Math.max(0, targetIndex - 1), targetIndex + 2).map((node, index) =>
                index === 1 ? 'target-window' : labelNode(node)
              )
      };

      function emptyState(): ChromePlacementState {
        return {
          anchorChildren: [],
          groupChildren: [],
          sourceWrapperContainsTab: false,
          treeEndingAtRoot: false,
          targetSiblingOrder: []
        };
      }

      function findByLabel(nodes: unknown[], label: string): unknown {
        for (const node of nodes) {
          if (labelNode(node) === label) {
            return node;
          }
          const descendant = findByLabel(childrenOf(node), label);
          if (descendant !== undefined) {
            return descendant;
          }
        }
        return undefined;
      }

      function containsUrl(node: unknown, url: string): boolean {
        if (typeof node !== 'object' || node === null) {
          return false;
        }
        if ('url' in node && node.url === url) {
          return true;
        }
        return childrenOf(node).some((child) => containsUrl(child, url));
      }

      function childrenOf(node: unknown): unknown[] {
        return typeof node === 'object' && node !== null && 'children' in node && Array.isArray(node.children)
          ? node.children
          : [];
      }

      function labelNode(node: unknown): string {
        if (typeof node !== 'object' || node === null || !('kind' in node)) {
          return 'unknown';
        }
        if (node.kind === 'note' && 'text' in node && typeof node.text === 'string') {
          return node.text;
        }
        if (node.kind === 'separator' && 'style' in node && typeof node.style === 'number') {
          return `separator:${node.style}`;
        }
        return 'title' in node && typeof node.title === 'string' ? node.title : String(node.kind);
      }
    },
    {
      storageKey: 'browserAtlas.persistentTree.v2',
      expectedSourceUrl: sourceUrl,
      expectedTargetUrl: targetUrl
    }
  );
}

async function hasStoredNoteWithTab(serviceWorker: Worker, noteText: string, tabUrl: string): Promise<boolean> {
  return serviceWorker.evaluate(
    async ({ storageKey, expectedNoteText, expectedTabUrl }) => {
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return false;
      }
      return containsNote(document.roots);

      function containsNote(nodes: unknown[]): boolean {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (
            'kind' in node &&
            node.kind === 'note' &&
            'text' in node &&
            node.text === expectedNoteText &&
            children.some(
              (child) =>
                typeof child === 'object' &&
                child !== null &&
                'kind' in child &&
                child.kind === 'tab' &&
                'url' in child &&
                child.url === expectedTabUrl
            )
          ) {
            return true;
          }
          if (containsNote(children)) {
            return true;
          }
        }
        return false;
      }
    },
    {
      storageKey: 'browserAtlas.persistentTree.v2',
      expectedNoteText: noteText,
      expectedTabUrl: tabUrl
    }
  );
}

type SavedOrganizerState = {
  rootKinds: string[];
  groups: Array<{
    title: string;
    nestedKinds: string[];
    noteTexts: string[];
    separatorStyles: number[];
  }>;
};

async function readSavedOrganizerState(serviceWorker: Worker): Promise<SavedOrganizerState> {
  return serviceWorker.evaluate(async () => {
    const storageKey = 'browserAtlas.persistentTree.v2';
    const storage = await chrome.storage.local.get(storageKey);
    const document: unknown = storage[storageKey];
    const items =
      typeof document === 'object' &&
      document !== null &&
      'format' in document &&
      document.format === 'browser-atlas-tree' &&
      'version' in document &&
      document.version === 2 &&
      'roots' in document
        ? document.roots
        : null;
    if (!Array.isArray(items)) {
      return { rootKinds: [], groups: [] };
    }
    const groups = items.filter(
      (item): item is { kind: 'group'; title: string; children: unknown[] } =>
        typeof item === 'object' &&
        item !== null &&
        'kind' in item &&
        item.kind === 'group' &&
        'title' in item &&
        typeof item.title === 'string' &&
        'children' in item &&
        Array.isArray(item.children)
    );
    return {
      rootKinds: items.flatMap((item) => readStoredKind(item)),
      groups: groups.map((group) => ({
        title: group.title,
        nestedKinds: group.children.flatMap((item) => readStoredKind(item)),
        noteTexts: group.children.flatMap((item) =>
          typeof item === 'object' && item !== null && 'kind' in item && item.kind === 'note' && 'text' in item
            ? typeof item.text === 'string'
              ? [item.text]
              : []
            : []
        ),
        separatorStyles: group.children.flatMap((item) =>
          typeof item === 'object' &&
          item !== null &&
          'kind' in item &&
          item.kind === 'separator' &&
          'style' in item &&
          typeof item.style === 'number'
            ? [item.style]
            : []
        )
      }))
    };

    function readStoredKind(item: unknown): string[] {
      return typeof item === 'object' && item !== null && 'kind' in item && typeof item.kind === 'string'
        ? [item.kind]
        : [];
    }
  });
}

async function hasPersistentParentChild(
  serviceWorker: Worker,
  parentKind: string,
  childKind: string
): Promise<boolean> {
  return serviceWorker.evaluate(
    async ({ parent, child }) => {
      const storageKey = 'browserAtlas.persistentTree.v2';
      const storage = await chrome.storage.local.get(storageKey);
      const document: unknown = storage[storageKey];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return false;
      }
      return containsParentChild(document.roots);

      function containsParentChild(nodes: unknown[]): boolean {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('kind' in node) || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (
            node.kind === parent &&
            children.some(
              (candidate) =>
                typeof candidate === 'object' && candidate !== null && 'kind' in candidate && candidate.kind === child
            )
          ) {
            return true;
          }
          if (containsParentChild(children)) {
            return true;
          }
        }
        return false;
      }
    },
    { parent: parentKind, child: childKind }
  );
}

type PersistentWindowTitleState = Readonly<{
  title: string;
  customTitle: boolean;
  state: 'live' | 'saved' | 'crashed';
  windowId: number | null;
  tabUrls: string[];
}>;

async function readPersistentWindowTitleState(
  serviceWorker: Worker,
  treeNodeId: string
): Promise<PersistentWindowTitleState | null> {
  return serviceWorker.evaluate(async ({ storageKey, persistentId }) => {
    const storage = await chrome.storage.local.get(storageKey);
    const document: unknown = storage[storageKey];
    if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }
    return findWindow(document.roots);

    function findWindow(nodes: unknown[]): PersistentWindowTitleState | null {
      for (const node of nodes) {
        if (typeof node !== 'object' || node === null || !('children' in node) || !Array.isArray(node.children)) {
          continue;
        }
        if (
          'kind' in node &&
          node.kind === 'window' &&
          'id' in node &&
          node.id === persistentId &&
          'title' in node &&
          typeof node.title === 'string' &&
          'binding' in node &&
          typeof node.binding === 'object' &&
          node.binding !== null &&
          'state' in node.binding &&
          (node.binding.state === 'live' || node.binding.state === 'saved' || node.binding.state === 'crashed')
        ) {
          return {
            title: node.title,
            customTitle: 'customTitle' in node && node.customTitle === true,
            state: node.binding.state,
            windowId:
              node.binding.state === 'live' && 'windowId' in node.binding && typeof node.binding.windowId === 'number'
                ? node.binding.windowId
                : null,
            tabUrls: collectTabUrls(node.children)
          };
        }
        const descendant = findWindow(node.children);
        if (descendant) {
          return descendant;
        }
      }
      return null;
    }

    function collectTabUrls(nodes: unknown[]): string[] {
      return nodes.flatMap((node): string[] => {
        if (typeof node !== 'object' || node === null || !('children' in node) || !Array.isArray(node.children)) {
          return [];
        }
        const url = 'kind' in node && node.kind === 'tab' && 'url' in node && typeof node.url === 'string'
          ? [node.url]
          : [];
        return [...url, ...collectTabUrls(node.children)];
      });
    }
  }, {
    storageKey: 'browserAtlas.persistentTree.v2',
    persistentId: treeNodeId.replace(/^explore-saved-(?:window|group)-/u, '')
  });
}

type WindowBounds = Readonly<{ left: number; top: number; width: number; height: number }>;

type PersistentWindowBoundsState = Readonly<{
  state: 'live' | 'saved' | 'crashed';
  windowId: number | null;
  bounds: WindowBounds | null;
}>;

async function readPersistentWindowBoundsState(
  serviceWorker: Worker,
  treeNodeId: string
): Promise<PersistentWindowBoundsState | null> {
  return serviceWorker.evaluate(async ({ storageKey, persistentId }) => {
    const storage = await chrome.storage.local.get(storageKey);
    const document: unknown = storage[storageKey];
    if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }
    return findWindow(document.roots);

    function findWindow(nodes: unknown[]): PersistentWindowBoundsState | null {
      for (const node of nodes) {
        if (typeof node !== 'object' || node === null || !('children' in node) || !Array.isArray(node.children)) {
          continue;
        }
        if (
          'kind' in node &&
          node.kind === 'window' &&
          'id' in node &&
          node.id === persistentId &&
          'binding' in node &&
          typeof node.binding === 'object' &&
          node.binding !== null &&
          'state' in node.binding &&
          (node.binding.state === 'live' || node.binding.state === 'saved' || node.binding.state === 'crashed')
        ) {
          return {
            state: node.binding.state,
            windowId:
              node.binding.state === 'live' && 'windowId' in node.binding && typeof node.binding.windowId === 'number'
                ? node.binding.windowId
                : null,
            bounds: readBounds('bounds' in node ? node.bounds : undefined)
          };
        }
        const descendant = findWindow(node.children);
        if (descendant) {
          return descendant;
        }
      }
      return null;
    }

    function readBounds(value: unknown): WindowBounds | null {
      if (typeof value !== 'object' || value === null) {
        return null;
      }
      const bounds = value as Partial<Record<'left' | 'top' | 'width' | 'height', unknown>>;
      return typeof bounds.left === 'number' &&
        typeof bounds.top === 'number' &&
        typeof bounds.width === 'number' &&
        typeof bounds.height === 'number'
        ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
        : null;
    }
  }, {
    storageKey: 'browserAtlas.persistentTree.v2',
    persistentId: treeNodeId.replace(/^explore-saved-window-/u, '')
  });
}

async function readChromeWindowBounds(serviceWorker: Worker, windowId: number): Promise<WindowBounds> {
  return serviceWorker.evaluate(async (browserWindowId) => {
    const browserWindow = await chrome.windows.get(browserWindowId);
    return {
      left: browserWindow.left ?? 0,
      top: browserWindow.top ?? 0,
      width: browserWindow.width ?? 0,
      height: browserWindow.height ?? 0
    };
  }, windowId);
}

type OrganizedLiveTabState =
  | Readonly<{ state: 'live'; windowId: number }>
  | Readonly<{ state: 'saved'; windowId: null }>
  | null;

async function readOrganizedLiveTab(
  serviceWorker: Worker,
  organizerTitle: string,
  tabId: number
): Promise<OrganizedLiveTabState> {
  return serviceWorker.evaluate(
    async ({ title, browserTabId, expectedUrl }) => {
      const storage = await chrome.storage.local.get('browserAtlas.persistentTree.v2');
      const document: unknown = storage['browserAtlas.persistentTree.v2'];
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return null;
      }
      const organizer = findOrganizer(document.roots);
      if (!organizer) {
        return null;
      }
      return findTab(organizer.children);

      function findOrganizer(nodes: unknown[]): { children: unknown[] } | null {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('children' in node) || !Array.isArray(node.children)) {
            continue;
          }
          if (
            'kind' in node &&
            ((node.kind === 'group' && 'title' in node && node.title === title) ||
              (node.kind === 'note' && 'text' in node && node.text === title))
          ) {
            return { children: node.children };
          }
          const descendant = findOrganizer(node.children);
          if (descendant) {
            return descendant;
          }
        }
        return null;
      }

      function findTab(nodes: unknown[]): OrganizedLiveTabState {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('children' in node) || !Array.isArray(node.children)) {
            continue;
          }
          if (
            'kind' in node &&
            node.kind === 'tab' &&
            'url' in node &&
            node.url === expectedUrl &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding &&
            node.binding.state === 'live' &&
            'tabId' in node.binding &&
            node.binding.tabId === browserTabId &&
            'windowId' in node.binding &&
            typeof node.binding.windowId === 'number'
          ) {
            return { state: 'live', windowId: node.binding.windowId };
          }
          if (
            'kind' in node &&
            node.kind === 'tab' &&
            'url' in node &&
            node.url === expectedUrl &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding &&
            (node.binding.state === 'saved' || node.binding.state === 'crashed')
          ) {
            return { state: 'saved', windowId: null };
          }
          const descendant = findTab(node.children);
          if (descendant) {
            return descendant;
          }
        }
        return null;
      }
    },
    { title: organizerTitle, browserTabId: tabId, expectedUrl: sourceUrl }
  );
}

async function removeTestWindows(serviceWorker: Worker, state: TestBrowserState): Promise<void> {
  await serviceWorker.evaluate(
    async ({ controlledOrigin, windowIds }) => {
      const controlledWindows = new Set(windowIds);
      for (const tab of await chrome.tabs.query({})) {
        if (tab.url?.startsWith(controlledOrigin)) {
          controlledWindows.add(tab.windowId);
        }
      }
      for (const windowId of controlledWindows) {
        try {
          await chrome.windows.remove(windowId);
        } catch {
          // A failed test may already have closed a controlled window.
        }
      }
      await chrome.storage.local.clear();
    },
    { controlledOrigin: testServerOrigin, windowIds: [state.sourceWindowId, state.targetWindowId] }
  );
}

async function removeWindowIfPresent(serviceWorker: Worker, windowId: number): Promise<void> {
  await serviceWorker.evaluate(async (targetWindowId) => {
    try {
      await chrome.windows.remove(targetWindowId);
    } catch {
      // A failed assertion or browser event may already have closed the created window.
    }
  }, windowId);
}

async function removeTemporaryProfile(userDataDirectory: string): Promise<void> {
  const expectedParent = tmpdir();
  const profileName = userDataDirectory.slice(expectedParent.length + 1);
  if (dirname(userDataDirectory) !== expectedParent || !profileName.startsWith('browser-atlas-e2e-')) {
    throw new Error(`Refusing to remove an unexpected Chromium profile: ${userDataDirectory}`);
  }
  await rm(userDataDirectory, { force: true, recursive: true });
}
