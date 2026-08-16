import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const MOCK_TREE_STORAGE_KEY = 'browserAtlas.mockTree.v2';
const FIREFOX_MOCK_TREE_STORAGE_KEY = 'browserAtlas.mockTree.v2.firefox';
const MOCK_DELETION_STORAGE_KEY = 'browserAtlas.mockDeletedItems.v1';
const FIREFOX_MOCK_DELETION_STORAGE_KEY = 'browserAtlas.mockDeletedItems.v1.firefox';
const MOCK_SNAPSHOTS_STORAGE_KEY = 'browserAtlas.mockTreeSnapshots.v1';
const FIREFOX_MOCK_SNAPSHOTS_STORAGE_KEY = 'browserAtlas.mockTreeSnapshots.v1.firefox';
const MOCK_CLOUD_BACKUPS_STORAGE_KEY = 'browserAtlas.mockCloudBackups.v1';
const FIREFOX_MOCK_CLOUD_BACKUPS_STORAGE_KEY = 'browserAtlas.mockCloudBackups.v1.firefox';
const MOCK_CLOUD_CONFIGURATION_STORAGE_KEY = 'browserAtlas.mockCloudConfiguration.v1';
const FIREFOX_MOCK_CLOUD_CONFIGURATION_STORAGE_KEY = 'browserAtlas.mockCloudConfiguration.v1.firefox';
const MOCK_CLOUD_ATTEMPT_STORAGE_KEY = 'browserAtlas.mockCloudAttempt.v1';
const SETTINGS_STORAGE_KEY = 'browserAtlas.settings.v1';
const CLIPBOARD_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ storageKeys, settingsStorageKey }) => {
    const initializedKey = 'browserAtlas.e2e.initialized';
    if (sessionStorage.getItem(initializedKey) === null) {
      for (const storageKey of storageKeys) {
        localStorage.removeItem(storageKey);
      }
      localStorage.removeItem(settingsStorageKey);
      sessionStorage.setItem(initializedKey, 'true');
    }
  }, {
    storageKeys: [
      MOCK_TREE_STORAGE_KEY,
      FIREFOX_MOCK_TREE_STORAGE_KEY,
      MOCK_DELETION_STORAGE_KEY,
      FIREFOX_MOCK_DELETION_STORAGE_KEY,
      MOCK_SNAPSHOTS_STORAGE_KEY,
      FIREFOX_MOCK_SNAPSHOTS_STORAGE_KEY,
      MOCK_CLOUD_BACKUPS_STORAGE_KEY,
      FIREFOX_MOCK_CLOUD_BACKUPS_STORAGE_KEY,
      MOCK_CLOUD_CONFIGURATION_STORAGE_KEY,
      FIREFOX_MOCK_CLOUD_CONFIGURATION_STORAGE_KEY
    ],
    settingsStorageKey: SETTINGS_STORAGE_KEY
  });
});

test('opens current Help and About dialogs in the localhost app', async ({ page }) => {
  await page.goto('/browser-atlas');

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'Browser Atlas help' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('heading', { name: 'Start here' })).toBeVisible();
  await help.getByText('Keyboard shortcuts', { exact: true }).click();
  await expect(help.getByText('Ctrl/Cmd+F', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  await page.getByRole('button', { name: 'About', exact: true }).click();
  const about = page.getByRole('dialog', { name: 'About Browser Atlas' });
  await expect(about).toContainText('SolidJS rewrite and continuation of Tabs Outliner');
  await expect(about).toContainText('Development web build');
  await expect(about).toContainText('Chrome and Firefox mocks');
  await about.getByRole('button', { name: 'Close About Browser Atlas' }).click();
  await expect(about).toHaveCount(0);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop out', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Browser Atlas' })).toBeVisible();
  await expect(popup.getByRole('region', { name: 'Left explorer pane' })).toBeVisible();
  await popup.close();
});

test('reveals the mock browser window requested by the extension-action URL', async ({ page }) => {
  await page.goto('/browser-atlas?focusWindowId=1002');

  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  await expect(leftPane.locator('[data-node-id="explore-window-1002"]')).toBeFocused();
});

test('supports persistent tab lifecycle and moves tabs between mock windows', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const sourceTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  const targetWindow = rightPane.locator('[data-node-id="explore-window-1002"]');
  await expect(sourceTab).toContainText('SolidJS documentation');
  await sourceTab.dragTo(targetWindow, { targetPosition: { x: 48, y: 10 } });
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(1002);
  const undo = leftPane.getByTitle('Undo the latest persistent tree change');
  const redo = leftPane.getByTitle('Redo the latest undone persistent tree change');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(1001);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(1002);

  const movedTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await movedTab.getByRole('button', { name: 'Close and save SolidJS documentation' }).click();
  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-live-tab-solid"]');
  await expect(savedTab).toBeVisible();
  await page.reload();
  await expect(savedTab).toBeVisible();
  await savedTab.getByRole('button', { name: 'Restore SolidJS documentation' }).click();
  await expect(savedTab).toHaveCount(0);
});

test('moves tabs and windows between independent mock browsers', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('combobox', { name: 'Explorer data source' }).selectOption({ label: 'Firefox (mock)' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const firefoxWindow = rightPane.locator('[data-node-id="explore-window-3002"]');
  const movedChromeTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await movedChromeTab.dragTo(firefoxWindow, { targetPosition: { x: 48, y: 10 } });
  await expect(movedChromeTab).toHaveCount(0);
  await expect(rightPane.locator('[data-node-id="explore-tab-20000"] a')).toHaveAttribute(
    'href',
    'https://docs.solidjs.com/'
  );

  const movedChromeWindow = leftPane.locator('[data-node-id="explore-window-1002"]');
  await movedChromeWindow.dragTo(rightPane.locator('[data-node-id="explore-window-3001"]'), {
    targetPosition: { x: 48, y: 10 }
  });
  await expect(movedChromeWindow).toHaveCount(0);
  await expect(rightPane.locator('[data-node-id="explore-tab-20001"] a')).toHaveAttribute(
    'href',
    'https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions'
  );

  await page.reload();
  await rightPane.getByRole('combobox', { name: 'Explorer data source' }).selectOption({ label: 'Firefox (mock)' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect(leftPane.locator('[data-node-id="explore-tab-2002"]')).toHaveCount(0);
  await expect(leftPane.locator('[data-node-id="explore-window-1002"]')).toHaveCount(0);
  await expect(leftPane.locator('[data-node-id="explore-tab-2001"]')).toBeVisible();
  await expect(rightPane.locator('[data-node-id="explore-tab-20000"]')).toBeVisible();
  await expect(rightPane.locator('[data-node-id="explore-tab-20001"]')).toBeVisible();
});

test('copies a tab between independent mock browsers when Alt is held', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('combobox', { name: 'Explorer data source' }).selectOption({ label: 'Firefox (mock)' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const sourceTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await modifierCopyDragTo(page, sourceTab, rightPane.locator('[data-node-id="explore-window-3002"]'));
  await expect(sourceTab).toBeVisible();
  await expect(rightPane.locator('[data-node-id="explore-tab-20000"] a')).toHaveAttribute(
    'href',
    'https://docs.solidjs.com/'
  );

  await page.reload();
  await rightPane.getByRole('combobox', { name: 'Explorer data source' }).selectOption({ label: 'Firefox (mock)' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect(leftPane.locator('[data-node-id="explore-tab-2002"]')).toBeVisible();
  await expect(rightPane.locator('[data-node-id="explore-tab-20000"]')).toBeVisible();
});

test('shows original live-window and live-tab statistics for collapsed mock branches', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveWindow = leftPane.locator('[data-node-id="explore-window-1001"]');

  await liveWindow.getByRole('button', { name: 'Collapse node' }).click();
  const tabOnlySummary = liveWindow.getByRole('button', {
    name: 'Hidden: 2 nodes, 0 live windows, 2 live tabs'
  });
  await expect(tabOnlySummary).toHaveText('[●2]');
  await tabOnlySummary.click();
  await expect(leftPane.locator('[data-node-id="explore-tab-2002"]')).toBeVisible();

  const root = leftPane.locator('[data-node-id="explore-root"]');
  await root.getByRole('button', { name: 'Collapse node' }).click();
  const mixedSummary = root.getByRole('button', {
    name: 'Hidden: 15 nodes, 2 live windows, 3 live tabs'
  });
  await expect(mixedSummary).toHaveText('[15/▣2/●3]');
  await mixedSummary.click();
  await expect(leftPane.locator('[data-node-id="explore-tab-2003"]')).toBeVisible();
});

test('persists interaction settings and defaults tab activation to double click', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const firstSavedLink = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-chrome"] a');

  await firstSavedLink.click();
  await expect(leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-chrome"]')).toBeVisible();
  await firstSavedLink.dblclick();
  await expect.poll(() => readMockBindingState(page, 'mock-saved-tab-chrome')).toBe('live');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Nest new tabs under their opener')).toBeChecked();
  await expect(page.getByLabel('Restore saved window position and size')).toBeChecked();
  await page.getByLabel('Activate with one click').check();
  await page.getByLabel('Open Browser Atlas on startup').check();
  const secondSavedLink = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-firefox"] a');
  await secondSavedLink.click();
  await expect.poll(() => readMockBindingState(page, 'mock-saved-tab-firefox')).toBe('live');
  await leftPane.locator('[data-node-id="explore-window-1002"]').click();
  await expect.poll(() => readFocusedMockWindowId(page)).toBe(1002);

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Activate with one click')).toBeChecked();
  await expect(page.getByLabel('Open Browser Atlas on startup')).toBeChecked();
  await expect(page.getByLabel('Nest new tabs under their opener')).toBeChecked();
  await expect(page.getByLabel('Restore saved window position and size')).toBeChecked();
});

test('restores mock windows in retained bounds and honors the original-bounds setting', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');

  await savedWindow.getByTitle('Restore this saved window').click();
  await expect.poll(() => readMockWindowState(page, 'mock-saved-window-reference')).toEqual({
    state: 'live',
    windowId: 10000,
    bounds: { left: 320, top: 140, width: 900, height: 680 }
  });
  await leftPane
    .locator('[data-node-id="explore-window-10000"]')
    .getByTitle('Close this window and keep its tabs in Browser Atlas')
    .click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Restore saved window position and size').uncheck();
  await page.getByRole('button', { name: 'Settings' }).click();
  await savedWindow.getByTitle('Restore this saved window').click();
  await expect.poll(() => readMockWindowState(page, 'mock-saved-window-reference')).toEqual({
    state: 'live',
    windowId: 10003,
    bounds: { left: 100, top: 100, width: 1200, height: 800 }
  });

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Restore saved window position and size')).not.toBeChecked();
});

test('applies and persists original appearance settings in the localhost mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const activeTabTitle = leftPane.locator('[data-node-id="explore-tab-2001"] span.truncate').first();
  const openTabTitle = leftPane.locator('[data-node-id="explore-tab-2002"] span.truncate').first();
  const savedTabTitle = leftPane
    .locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"] span.truncate')
    .first();
  const noteTitle = leftPane.locator('[data-node-id="explore-saved-note-mock-note-next"] span.truncate').first();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Use light background').check();
  await expect(page.locator('main')).toHaveAttribute('data-browser-atlas-theme', 'light');
  await expect(activeTabTitle).toHaveCSS('color', 'rgb(238, 238, 238)');
  await expect(openTabTitle).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(savedTabTitle).toHaveCSS('color', 'rgb(136, 136, 136)');
  await expect(noteTitle).toHaveCSS('color', 'rgb(0, 156, 106)');

  await setColorInput(page, 'Saved tab color', '#123456');
  await page.getByLabel('Override saved tab color').check();
  await setColorInput(page, 'Open tab color', '#654321');
  await page.getByLabel('Override open tab color').check();
  await setColorInput(page, 'Active tab color', '#abcdef');
  await page.getByLabel('Override active tab color').check();
  await setColorInput(page, 'Note color', '#fedcba');
  await page.getByLabel('Override note color').check();

  await expect(savedTabTitle).toHaveCSS('color', 'rgb(18, 52, 86)');
  await expect(openTabTitle).toHaveCSS('color', 'rgb(101, 67, 33)');
  await expect(activeTabTitle).toHaveCSS('color', 'rgb(171, 205, 239)');
  await expect(noteTitle).toHaveCSS('color', 'rgb(254, 220, 186)');

  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-browser-atlas-theme', 'light');
  await expect(activeTabTitle).toHaveCSS('color', 'rgb(171, 205, 239)');
  await expect(openTabTitle).toHaveCSS('color', 'rgb(101, 67, 33)');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Override saved tab color')).toBeChecked();
  await expect(page.getByLabel('Saved tab color', { exact: true })).toHaveValue('#123456');
  await expect(page.getByLabel('Override note color')).toBeChecked();
  await expect(page.getByLabel('Note color', { exact: true })).toHaveValue('#fedcba');
});

test('fills appearance defaults when reading pre-appearance settings', async ({ page }) => {
  await page.goto('/browser-atlas');
  await page.evaluate((storageKey) => {
    localStorage.setItem(storageKey, JSON.stringify({
      autoFollowFocusedWindow: false,
      oneClickActivation: true,
      openOnStartup: true
    }));
  }, SETTINGS_STORAGE_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();

  await expect(page.getByLabel('Follow the focused browser window')).not.toBeChecked();
  await expect(page.getByLabel('Activate with one click')).toBeChecked();
  await expect(page.getByLabel('Nest new tabs under their opener')).toBeChecked();
  await expect(page.getByLabel('Restore saved window position and size')).toBeChecked();
  await expect(page.getByLabel('Use light background')).not.toBeChecked();
  await expect(page.getByLabel('Override saved tab color')).not.toBeChecked();
  await expect(page.getByLabel('Saved tab color', { exact: true })).toHaveValue('#606060');
  await expect(page.getByLabel('Open tab color', { exact: true })).toHaveValue('#9cb7d3');
  await expect(page.getByLabel('Active tab color', { exact: true })).toHaveValue('#ffffff');
  await expect(page.getByLabel('Note color', { exact: true })).toHaveValue('#dad2b4');
});

test('auto-follows focus changes from the opposite mock pane and honors its setting', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 180 });
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  const leftScroller = leftPane.getByRole('tabpanel');
  const targetWindow = rightPane.locator('[data-node-id="explore-window-1002"]');
  for (let index = 0; index < 6; index += 1) {
    await pressOrganizerShortcut(page, targetWindow, 'Shift+g', `Focus spacer ${index + 1}`);
  }
  await leftScroller.dispatchEvent('pointerdown');
  await leftScroller.evaluate((element) => element.scrollTo({ top: 0 }));

  await rightPane.locator('[data-node-id="explore-tab-2003"] a').dblclick();
  await expect.poll(() => readFocusedMockWindowId(page)).toBe(1002);
  await expect.poll(() => leftScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Follow the focused browser window').uncheck();
  await page.getByRole('button', { name: 'Settings' }).click();
  await leftScroller.dispatchEvent('pointerdown');
  await leftScroller.evaluate((element) => element.scrollTo({ top: 0 }));
  await expect.poll(() => leftScroller.evaluate((element) => element.scrollTop)).toBe(0);
  await rightPane.locator('[data-node-id="explore-tab-2001"] a').dblclick();
  await expect.poll(() => readFocusedMockWindowId(page)).toBe(1001);
  await expect.poll(() => leftScroller.evaluate((element) => element.scrollTop)).toBe(0);
});

test('keeps custom live and saved window titles in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveWindow = leftPane.locator('[data-node-id="explore-window-1001"]');

  await selectTreeRow(liveWindow);
  await acceptNextPrompt(page, 'Focused research desk', () => liveWindow.press('F2'));
  await expect(liveWindow).toContainText('Focused research desk');
  await page.reload();
  await expect(liveWindow).toContainText('Focused research desk');

  await liveWindow.getByTitle('Close this window and keep its tabs in Browser Atlas').click();
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-live-window-research"]');
  await expect(savedWindow).toContainText('Focused research desk');
  await selectTreeRow(savedWindow);
  await acceptNextPrompt(page, 'Archived research desk', () => savedWindow.press('F2'));
  await expect(savedWindow).toContainText('Archived research desk');
  await page.reload();
  await expect(savedWindow).toContainText('Archived research desk');
});

test('restores only the latest saved window session with Alt activation in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveWindow = leftPane.locator('[data-node-id="explore-window-1001"]');
  const liveTab = leftPane.locator('[data-node-id="explore-tab-2001"]');
  const menu = page.getByRole('menu', { name: 'Tree commands' });
  const atlasUrl = 'http://localhost:3120/browser-atlas';

  await liveTab.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Copy hierarchy/ }).click();
  await liveWindow.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Paste as last child/ }).click();
  await expect.poll(() => readMockTabBindingCounts(page, 'mock-live-window-research', atlasUrl)).toEqual({
    live: 1,
    saved: 1
  });

  await liveWindow.getByRole('button', { name: /Close and save Research window/ }).click();
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-live-window-research"]');
  await expect(savedWindow).toBeVisible();
  await expect.poll(() => readMockTabBindingCounts(page, 'mock-live-window-research', atlasUrl)).toEqual({
    live: 0,
    saved: 2
  });

  await savedWindow.dblclick({ modifiers: ['Alt'] });
  await expect.poll(() => readMockTabBindingCounts(page, 'mock-live-window-research', atlasUrl)).toEqual({
    live: 1,
    saved: 1
  });

  const restoredWindowId = await readMockPersistentWindowId(page, 'mock-live-window-research');
  const restoredWindow = leftPane.locator(`[data-node-id="explore-window-${restoredWindowId}"]`);
  await restoredWindow.getByRole('button', { name: /Close and save/ }).click();
  await expect(savedWindow).toBeVisible();
  await savedWindow.focus();
  await savedWindow.press('Alt+Space');
  await expect.poll(() => readMockTabBindingCounts(page, 'mock-live-window-research', atlasUrl)).toEqual({
    live: 1,
    saved: 1
  });

  const keyboardRestoredWindowId = await readMockPersistentWindowId(page, 'mock-live-window-research');
  const keyboardRestoredWindow = leftPane.locator(`[data-node-id="explore-window-${keyboardRestoredWindowId}"]`);
  await keyboardRestoredWindow.getByRole('button', { name: /Close and save/ }).click();
  await expect(savedWindow).toBeVisible();
  await savedWindow.focus();
  await savedWindow.press(' ');
  await expect.poll(() => readMockTabBindingCounts(page, 'mock-live-window-research', atlasUrl)).toEqual({
    live: 2,
    saved: 0
  });
});

test('opens saved links in a new or last mock window without restoring the saved copy', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]');
  const savedLink = savedTab.getByRole('link', { name: 'Tabs Outliner architecture notes' });
  const url = 'https://example.com/browser-atlas/design';

  await savedLink.click({ modifiers: ['Shift'] });
  await expect.poll(() => readFocusedMockWindowId(page)).toBeGreaterThan(1002);
  const newWindowId = await readFocusedMockWindowId(page);
  if (newWindowId === null) {
    throw new Error('Shift+Click did not create a focused mock window.');
  }
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(3);
  await expect.poll(() => readMockLiveTabWindowsByUrl(page, url)).toEqual([newWindowId]);
  await expect(savedTab).toBeVisible();

  await savedLink.click({ modifiers: [CLIPBOARD_MODIFIER] });
  await expect.poll(() => readMockLiveTabWindowsByUrl(page, url)).toEqual([newWindowId, newWindowId]);
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(3);
  await expect(leftPane.locator('[data-node-id="explore-tab-10002"]')).toHaveAttribute('aria-level', '4');

  await savedLink.click({ button: 'middle' });
  await expect.poll(() => readMockLiveTabWindowsByUrl(page, url)).toEqual([
    newWindowId,
    newWindowId,
    newWindowId
  ]);
  await expect(leftPane.locator('[data-node-id="explore-tab-10003"]')).toHaveAttribute('aria-level', '5');
  await expect(savedTab).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Nest new tabs under their opener').uncheck();
  await page.getByRole('button', { name: 'Settings' }).click();
  await savedLink.click({ button: 'middle' });
  await expect(leftPane.locator('[data-node-id="explore-tab-10004"]')).toHaveAttribute('aria-level', '3');

  await page.reload();
  await expect(leftPane.locator('[data-node-id="explore-tab-10002"]')).toHaveAttribute('aria-level', '4');
  await expect(leftPane.locator('[data-node-id="explore-tab-10003"]')).toHaveAttribute('aria-level', '5');
  await expect(leftPane.locator('[data-node-id="explore-tab-10004"]')).toHaveAttribute('aria-level', '3');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Nest new tabs under their opener')).not.toBeChecked();
  await page.getByRole('button', { name: 'Settings' }).click();

  await savedTab.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tree commands' });
  await expect(menu.getByRole('menuitem', { name: /Open link in new window/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Open link in last window/ })).toBeVisible();
  await menu.press('Escape');
});

test('allows every persistent node kind to contain descendants', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  const note = rightPane.locator('[data-node-id="explore-saved-note-mock-note-next"]');
  await savedWindow.dragTo(note, { targetPosition: { x: 48, y: 10 } });
  await expect.poll(() => hasMockParentChild(page, 'mock-note-next', 'mock-saved-window-reference')).toBe(true);

  await savedWindow.getByTitle('Restore this saved window').click();
  await expect.poll(() => hasMockParentChild(page, 'mock-note-next', 'mock-saved-window-reference')).toBe(true);
  await expect(leftPane.locator('[data-node-id="explore-window-10000"]')).toBeVisible();
  await page.reload();
  await expect.poll(() => hasMockParentChild(page, 'mock-note-next', 'mock-saved-window-reference')).toBe(true);
});

test('creates precisely placed organizers by dragging the toolbar tools in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  const liveTab = rightPane.locator('[data-node-id="explore-tab-2002"]');

  await acceptNextPrompt(page, 'Dragged toolbar group', () =>
    leftPane.getByRole('button', { name: 'Group', exact: true }).dragTo(liveTab, { targetPosition: { x: 48, y: 10 } })
  );
  await expect.poll(() => readMockChildLabels(page, 'mock-live-tab-solid')).toContain('Dragged toolbar group');

  const group = rightPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'Dragged toolbar group' });
  await acceptNextPrompt(page, 'Dragged toolbar note', () =>
    leftPane.getByRole('button', { name: 'Note', exact: true }).dragTo(group, { targetPosition: { x: 48, y: 10 } })
  );
  const note = rightPane
    .locator('[data-node-id^="explore-saved-note-"]')
    .filter({ hasText: 'Dragged toolbar note' });
  await leftPane.getByRole('button', { name: 'Rule', exact: true }).dragTo(note, { targetPosition: { x: 48, y: 2 } });

  await expect.poll(() => readMockChildLabelsByLabel(page, 'Dragged toolbar group')).toEqual([
    'separator:0',
    'Dragged toolbar note'
  ]);
  await page.reload();
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Dragged toolbar group')).toEqual([
    'separator:0',
    'Dragged toolbar note'
  ]);
});

test('creates a live mock window where the Window toolbar tool is dropped', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  const projectGroup = rightPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');

  await leftPane
    .getByRole('button', { name: 'Window', exact: true })
    .dragTo(projectGroup, { targetPosition: { x: 48, y: 10 } });

  await expect.poll(() => readMockChildLabelsByLabel(page, 'Browser Atlas project')).toContain('New window');
  const createdWindow = rightPane.locator('[data-node-id="explore-window-10000"]');
  await expect(createdWindow).toBeVisible();
  await expect(rightPane.locator('[data-node-id="explore-tab-10001"]')).toContainText('New Tab');

  await page.reload();
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect(createdWindow).toBeVisible();
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Browser Atlas project')).toContain('New window');
});

test('creates and retains a protected Google Doc where the Doc toolbar tool is dropped', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  const projectGroup = rightPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');

  await leftPane
    .getByRole('button', { name: 'Doc', exact: true })
    .dragTo(projectGroup, { targetPosition: { x: 48, y: 10 } });

  await expect.poll(() => readMockChildLabelsByLabel(page, 'Browser Atlas project')).toContain('Untitled document');
  await expect.poll(() => readMockGoogleDocState(page)).toMatchObject({ state: 'live', keepOnClose: true });
  const documentRow = rightPane.locator('[data-node-id="explore-tab-10000"]');
  await expect(documentRow).toContainText('Untitled document');
  await expect(documentRow.getByRole('button', { name: 'Protected leaf node' })).toBeVisible();
  await expect(documentRow.locator('span.truncate')).toHaveClass(/text-blue-400/u);
  await documentRow.getByTitle('Close this tab and keep it in Browser Atlas').click();
  await expect.poll(() => readMockGoogleDocState(page)).toMatchObject({ state: 'saved', keepOnClose: true });

  await page.reload();
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Browser Atlas project')).toContain('Untitled document');
  const retainedDocumentRow = rightPane.locator('[data-node-id^="explore-saved-tab-"]').filter({
    hasText: 'Untitled document'
  });
  await expect(retainedDocumentRow.getByRole('button', { name: 'Leaf node' })).toBeVisible();
  await expect(retainedDocumentRow.locator('span.truncate')).toHaveClass(/text-blue-400/u);
});

test('copies a complete persistent hierarchy with Alt-drag in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const sourceWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  const destinationWindow = rightPane.locator('[data-node-id="explore-saved-window-mock-crashed-window"]');
  await copyDragTo(page, sourceWindow, destinationWindow);

  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toContain('Reference session');
  await expect.poll(() => readMockChildLabels(page, 'mock-crashed-window')).toContain('Reference session');
  await expect.poll(() => countMockNodesByLabel(page, 'Reference session')).toBe(2);
  await expect.poll(() => countMockNodesByLabel(page, 'Chrome Extensions API')).toBe(2);
  await expect.poll(() => countMockNodesByLabel(page, 'Cross-browser research')).toBe(2);
  await expect.poll(() => countMockNodesByLabel(page, 'Firefox WebExtensions')).toBe(2);

  await page.reload();
  await expect.poll(() => readMockChildLabels(page, 'mock-crashed-window')).toContain('Reference session');
  await expect.poll(() => countMockNodesByLabel(page, 'Firefox WebExtensions')).toBe(2);
});

test('keeps a live tab inside a saved note without moving its browser tab', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  const savedNote = rightPane.locator('[data-node-id="explore-saved-note-mock-note-next"]');
  await liveTab.dragTo(savedNote, { targetPosition: { x: 48, y: 10 } });

  await expect.poll(() => hasMockParentChild(page, 'mock-note-next', 'mock-live-tab-solid')).toBe(true);
  await expect(leftPane.locator('[data-node-id="explore-tab-2002"]')).toBeVisible();
  await expect(leftPane.locator('[data-node-id="explore-saved-tab-mock-live-tab-solid"]')).toHaveCount(0);

  await page.reload();
  await expect(leftPane.locator('[data-node-id="explore-tab-2002"]')).toBeVisible();
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(1001);
});

test('opens a saved group as a live mock window', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  await leftPane.locator('[data-node-id="explore-root"]').click();
  await acceptNextPrompt(page, 'Mock window group', () => leftPane.getByTitle('Create a saved group').click());

  const savedGroup = leftPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'Mock window group' });
  const nodeId = await savedGroup.getAttribute('data-node-id');
  if (!nodeId) {
    throw new Error('The created mock group has no persistent node ID.');
  }
  const persistentId = nodeId.replace(/^explore-saved-group-/u, '');
  await selectTreeRow(savedGroup);
  await savedGroup.press('Space');

  await expect.poll(() => readMockWindowState(page, persistentId)).toMatchObject({
    state: 'live',
    windowId: 10_000
  });
  await expect(leftPane.locator('[data-node-id="explore-window-10000"]')).toContainText('Mock window group');
  await expect.poll(() => readMockChildLabels(page, persistentId)).toContain('New Tab');

  await page.reload();
  await expect(leftPane.locator('[data-node-id="explore-window-10000"]')).toContainText('Mock window group');
  await expect.poll(() => readMockWindowState(page, persistentId)).toMatchObject({
    state: 'live',
    windowId: 10_000
  });
});

test('turns a saved group into a new mock window when a live tab is dropped inside', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await leftPane.locator('[data-node-id="explore-root"]').click();
  await acceptNextPrompt(page, 'Dropped tab window', () => leftPane.getByTitle('Create a saved group').click());
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  const savedGroup = rightPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'Dropped tab window' });
  const nodeId = await savedGroup.getAttribute('data-node-id');
  if (!nodeId) {
    throw new Error('The created mock group has no persistent node ID.');
  }
  const persistentId = nodeId.replace(/^explore-saved-group-/u, '');
  await liveTab.dragTo(savedGroup, { targetPosition: { x: 48, y: 10 } });

  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(10_000);
  await expect.poll(() => hasMockParentChild(page, persistentId, 'mock-live-tab-solid')).toBe(true);
  await expect(leftPane.locator('[data-node-id="explore-window-10000"]')).toContainText('Dropped tab window');

  await page.reload();
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(10_000);
  await expect.poll(() => readMockWindowState(page, persistentId)).toMatchObject({
    state: 'live',
    windowId: 10_000
  });
});

test('liberates a live tab into a new mock window by dropping it on the Explore root', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');

  await selectTreeRow(liveTab);
  await acceptNextPrompt(page, 'Liberated mock context', () => liveTab.press('F2'));
  await liveTab.dragTo(rightPane.locator('[data-node-id="explore-root"]'), {
    targetPosition: { x: 48, y: 10 }
  });

  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(10_000);
  const newWindow = leftPane.locator('[data-node-id="explore-window-10000"]');
  await expect(newWindow).toBeVisible();
  await expect(liveTab).toBeVisible();
  await expect(
    leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Liberated mock context' })
  ).toBeVisible();
  await expect.poll(() => hasMockParentChild(page, 'mock-live-window-research', 'mock-live-tab-solid')).toBe(false);

  await page.reload();
  await expect(newWindow).toBeVisible();
  await expect.poll(() => readMockTabWindow(page, 'mock-live-tab-solid')).toBe(10_000);
  await expect.poll(() => hasMockParentKind(page, 'mock-live-tab-solid', 'note')).toBe(true);
});

test('attaches notes to live tabs and preserves their context on close', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await liveTab.click();
  acceptNextOperationDialog(page, 'Why this tab matters');
  await leftPane.getByTitle('Create a saved note').click();
  await expect.poll(() => hasMockParentKind(page, 'mock-live-tab-solid', 'note')).toBe(true);
  await expect(liveTab.getByRole('button', { name: /Protected/u })).toBeVisible();

  await liveTab.getByRole('button', { name: 'Close and save SolidJS documentation' }).click();
  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-live-tab-solid"]');
  const attachedNote = leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Why this tab matters' });
  await expect(savedTab).toBeVisible();
  await expect(savedTab.getByRole('button', { name: 'Collapse node' })).toBeVisible();
  await expect(attachedNote).toBeVisible();
  await expect.poll(() => hasMockParentKind(page, 'mock-live-tab-solid', 'note')).toBe(true);
  await page.reload();
  await expect(savedTab).toBeVisible();
  await expect(attachedNote).toBeVisible();
});

test('save-closes only the selected live mock tab while its hierarchy is expanded', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const sourceTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  const nestedWindow = leftPane.locator('[data-node-id="explore-window-1002"]');
  await selectTreeRow(nestedWindow);
  await nestedWindow.press('Tab');
  await selectTreeRow(nestedWindow);
  await nestedWindow.press('Tab');
  await expect.poll(() => hasMockParentChild(page, 'mock-live-tab-solid', 'mock-live-window-reading')).toBe(true);

  await sourceTab.getByRole('button', { name: 'Close and save SolidJS documentation' }).click();

  await expect.poll(() => readMockBindingState(page, 'mock-live-tab-solid')).toBe('saved');
  await expect.poll(() => readMockBindingState(page, 'mock-live-window-reading')).toBe('live');
  await expect.poll(() => readMockBindingState(page, 'mock-live-tab-mdn')).toBe('live');
  await expect(nestedWindow).toBeVisible();
});

test('save-closes every live mock descendant hidden beneath a collapsed tab', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const sourceTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  const nestedWindow = leftPane.locator('[data-node-id="explore-window-1002"]');
  await selectTreeRow(nestedWindow);
  await nestedWindow.press('Tab');
  await selectTreeRow(nestedWindow);
  await nestedWindow.press('Tab');
  await expect.poll(() => hasMockParentChild(page, 'mock-live-tab-solid', 'mock-live-window-reading')).toBe(true);

  await sourceTab.getByRole('button', { name: 'Collapse node' }).click();
  await sourceTab.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tree commands' });
  await expect(menu.getByRole('menuitem', { name: 'Save & Close hierarchy' })).toBeVisible();
  await menu.press('Escape');
  await selectTreeRow(sourceTab);
  await sourceTab.press('Backspace');

  await expect.poll(() => readMockBindingState(page, 'mock-live-tab-solid')).toBe('saved');
  await expect.poll(() => readMockBindingState(page, 'mock-live-window-reading')).toBe('saved');
  await expect.poll(() => readMockBindingState(page, 'mock-live-tab-mdn')).toBe('saved');
  await page.reload();
  await expect(leftPane.locator('[data-node-id="explore-window-1002"]')).toHaveCount(0);
  await expect(leftPane.locator('[data-node-id="explore-tab-2003"]')).toHaveCount(0);
});

test('supports F2 inline tab notes and original note-to-organizer shorthands in the mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');

  await liveTab.focus();
  acceptNextOperationDialog(page, 'Inline tab context');
  await liveTab.press('F2');
  const inlineNote = leftPane
    .locator('[data-node-id^="explore-saved-note-"]')
    .filter({ hasText: 'Inline tab context' });
  await expect(inlineNote).toBeVisible();
  await expect.poll(() => hasMockParentKind(page, 'mock-live-tab-solid', 'note')).toBe(true);

  await liveTab.focus();
  acceptNextOperationDialog(page, 'Edited inline tab context');
  await liveTab.press('F2');
  await expect(inlineNote).toContainText('Edited inline tab context');

  const root = leftPane.locator('[data-node-id="explore-root"]');
  await root.click();
  acceptNextOperationDialog(page, '2G Shortcut group');
  await leftPane.getByTitle('Create a saved note').click();
  await expect(
    leftPane.locator('[data-node-id^="explore-saved-group-"]').filter({ hasText: 'Shortcut group' })
  ).toBeVisible();

  await root.click();
  acceptNextOperationDialog(page, '====');
  await leftPane.getByTitle('Create a saved note').click();
  await expect.poll(() => readMockChildLabels(page, null)).toContain('separator:1');
});

test('imports selected text and links into the persistent mock tree', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const projectGroup = leftPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');

  await dropExternalData(projectGroup, { 'text/plain': 'Selected research context' });
  const importedNote = leftPane
    .locator('[data-node-id^="explore-saved-note-"]')
    .filter({ hasText: 'Selected research context' });
  await expect(importedNote).toBeVisible();

  await dropExternalData(importedNote, {
    'text/uri-list': 'https://example.com/imported-reference',
    'text/plain': 'https://example.com/imported-reference',
    'text/html': '<a href="https://example.com/imported-reference">Imported reference title</a>'
  });
  const importedTab = leftPane
    .locator('[data-node-id^="explore-saved-tab-"]')
    .filter({ hasText: 'Imported reference title' });
  await expect(importedTab).toBeVisible();
  await expect.poll(() => hasMockNoteWithTab(page, 'Selected research context', 'https://example.com/imported-reference')).toBe(true);

  await dropExternalData(importedNote, {
    'text/html': '<p><a href="https://example.com/html-only">HTML-only guide</a></p>'
  });
  await expect(
    leftPane.locator('[data-node-id^="explore-saved-tab-"]').filter({ hasText: 'HTML-only guide' })
  ).toBeVisible();

  await dropExternalData(importedNote, {
    'text/html': '<p>Selected <strong>rich</strong> context</p>'
  });
  await expect(
    leftPane.locator('[data-node-id^="explore-saved-note-"]').filter({ hasText: 'Selected rich context' })
  ).toBeVisible();

  await page.reload();
  await expect(importedNote).toBeVisible();
  await expect(importedTab).toBeVisible();
});

test('exports native URI, HTML, text, and complete hierarchy drag formats in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  const targetNote = leftPane.locator('[data-node-id="explore-saved-note-mock-note-next"]');
  const transfer = await dispatchDragWrite(savedWindow);

  expect(transfer['application/x-browser-atlas-transfer+json']).toContain('browser-atlas-transfer');
  expect(transfer['application/json']).toContain('browser-atlas-transfer');
  expect(transfer['text/plain']).toContain('Reference session');
  expect(transfer['text/plain']).toContain('Chrome Extensions API');
  expect(transfer['text/plain']).not.toContain('browser-atlas-transfer:v2');
  expect(transfer['text/uri-list']).toBe('https://developer.chrome.com/docs/extensions/reference/api');
  expect(transfer['text/html']).toContain('<!--browser-atlas-transfer:v2');
  expect(transfer['text/html']).toContain('<a href="https://developer.chrome.com/docs/extensions/reference/api">');

  await dropExternalData(targetNote, { 'text/html': transfer['text/html'] ?? '' });
  await expect.poll(() => countMockChildrenByTitle(page, 'mock-note-next', 'Reference session')).toBe(1);
});

test('copies, cuts, and pastes complete hierarchies through the website clipboard mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  const note = leftPane.locator('[data-node-id="explore-saved-note-mock-note-next"]');

  await selectTreeRow(savedWindow);
  const copiedHierarchy = await dispatchClipboardWrite(savedWindow, 'copy');
  expect(copiedHierarchy['application/x-browser-atlas-items+json']).toContain('Cross-browser research');
  expect(copiedHierarchy['text/plain']).toContain('Firefox WebExtensions');
  expect(copiedHierarchy['text/html']).toContain('<ul>');
  expect(copiedHierarchy['text/uri-list']).toContain('developer.chrome.com');

  await savedWindow.press(`${CLIPBOARD_MODIFIER}+c`);
  await expect.poll(() => page.evaluate<string>('navigator.clipboard.readText()')).toContain('Firefox WebExtensions');
  await selectTreeRow(note);
  await note.press(`${CLIPBOARD_MODIFIER}+v`);
  await expect.poll(() => countMockChildrenByTitle(page, 'mock-note-next', 'Reference session')).toBe(1);
  await expect(savedWindow).toBeVisible();

  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]');
  await selectTreeRow(savedTab);
  await savedTab.press(`${CLIPBOARD_MODIFIER}+x`);
  await expect(savedTab).toHaveCount(0);
  await selectTreeRow(note);
  await note.press(`${CLIPBOARD_MODIFIER}+v`);
  await expect.poll(() => countMockChildrenByUrl(page, 'mock-note-next', 'https://example.com/browser-atlas/design')).toBe(1);
  await page.reload();
  await expect.poll(() => countMockChildrenByTitle(page, 'mock-note-next', 'Reference session')).toBe(1);
  await expect.poll(() => countMockChildrenByUrl(page, 'mock-note-next', 'https://example.com/browser-atlas/design')).toBe(1);
});

test('offers clipboard, organizer, and structural commands from the tree context menu', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  const note = leftPane.locator('[data-node-id="explore-saved-note-mock-note-next"]');

  await savedWindow.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tree commands' });
  await expect(menu.getByRole('heading', { name: 'Clipboard' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'General' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Notes and organizers' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Move hierarchy' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Utilities' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Global' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Restore last saved session/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Flatten tabs hierarchy/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Find visible nodes/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Print visible tree/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Export visible tree as HTML/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Scroll up to previous open window/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Undo tree scroll/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Clone view into other pane/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: /Copy hierarchy/ }).click();

  await note.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Paste as last child/ }).click();
  await expect.poll(() => countMockChildrenByTitle(page, 'mock-note-next', 'Reference session')).toBe(1);

  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]');
  await savedTab.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Cut hierarchy/ }).click();
  await expect(savedTab).toHaveCount(0);
  await note.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Paste as last child/ }).click();
  await expect.poll(() => countMockChildrenByUrl(page, 'mock-note-next', 'https://example.com/browser-atlas/design')).toBe(1);

  await note.click({ button: 'right' });
  await acceptNextPrompt(page, 'Context menu note', () =>
    menu.getByRole('menuitem', { name: /Note below/ }).click()
  );
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toContain('Context menu note');
  const contextNote = leftPane
    .locator('[data-node-id^="explore-saved-note-"]')
    .filter({ hasText: 'Context menu note' });

  await contextNote.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Move to first position/ }).click();
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Context menu note',
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);

  await expect(menu).toHaveCount(0);
  await contextNote.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error('The context-menu target is not attached to a browser window.');
    }
    element.dispatchEvent(new view.MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true }));
  });
  await expect(menu).toHaveCount(0);
});

test('restores a saved hierarchy into an existing mock window by dropping it', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  await rightPane.getByRole('tab', { name: 'Explore' }).click();

  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  const targetWindow = rightPane.locator('[data-node-id="explore-window-1001"]');
  await savedWindow.dragTo(targetWindow, { targetPosition: { x: 48, y: 10 } });

  await expect.poll(() => readMockTabWindow(page, 'mock-saved-tab-chrome')).toBe(1001);
  await expect.poll(() => readMockTabWindow(page, 'mock-saved-tab-firefox')).toBe(1001);
  await expect(savedWindow).toHaveCount(0);
  await expect(leftPane.locator('[data-node-id="explore-saved-group-mock-saved-window-reference"]')).toBeVisible();

  await page.reload();
  await expect(leftPane.locator('[data-node-id="explore-saved-group-mock-saved-window-reference"]')).toBeVisible();
  await expect(leftPane.locator('[data-node-id^="explore-tab-10"]')).toHaveCount(2);
});

test('opens a new browser window in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const existingTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(2);
  await existingTab.evaluate((element) => element.setAttribute('data-render-instance', 'preserved'));

  await leftPane.getByTitle('Open a new browser window').click();
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(3);
  await expect(leftPane.getByRole('link', { name: 'New Tab' })).toBeVisible();
  await expect(existingTab).toHaveAttribute('data-render-instance', 'preserved');

  await page.reload();
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(3);
  await expect(leftPane.getByRole('link', { name: 'New Tab' })).toBeVisible();
});

test('expands every branch and restores the previous collapsed set', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveWindow = leftPane.locator('[data-node-id="explore-window-1001"]');
  const projectGroup = leftPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');
  const liveTab = leftPane.locator('[data-node-id="explore-tab-2001"]');
  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');

  await liveWindow.getByRole('button', { name: 'Collapse node' }).click();
  await projectGroup.getByRole('button', { name: 'Collapse node' }).click();
  await expect(liveTab).toHaveCount(0);
  await expect(savedWindow).toHaveCount(0);

  await leftPane.getByTitle('Expand all collapsed branches').click();
  await expect(liveTab).toBeVisible();
  await expect(savedWindow).toBeVisible();

  await leftPane.getByTitle('Restore the previous collapsed branches').click();
  await expect(liveTab).toHaveCount(0);
  await expect(savedWindow).toHaveCount(0);
});

test('creates and restores local tree snapshots in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  await leftPane.getByTitle('Create a local tree snapshot').click();

  await leftPane.locator('[data-node-id="explore-root"]').click();
  acceptNextOperationDialog(page, 'Temporary after backup');
  await leftPane.getByTitle('Create a saved group').click();
  const temporaryGroup = leftPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'Temporary after backup' });
  await expect(temporaryGroup).toBeVisible();

  acceptNextOperationDialog(page);
  await leftPane.getByTitle('Restore the latest local tree snapshot').click();
  await expect(temporaryGroup).toHaveCount(0);
  await page.reload();
  await expect(temporaryGroup).toHaveCount(0);
});

test('browses and selectively restores local snapshot history in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  const root = leftPane.locator('[data-node-id="explore-root"]');
  await leftPane.getByTitle('Create a local tree snapshot').click();

  await root.click();
  await acceptNextPrompt(page, 'First post-backup group', () =>
    leftPane.getByTitle('Create a saved group').click()
  );
  await leftPane.getByTitle('Create a local tree snapshot').click();

  await root.click();
  await acceptNextPrompt(page, 'Second post-backup group', () =>
    leftPane.getByTitle('Create a saved group').click()
  );
  await leftPane.getByTitle('Browse and restore local tree snapshots').click();

  const history = leftPane.getByRole('dialog', { name: 'Local backup history' });
  const entries = history.locator('li[data-created-at]');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText(/\d+ nodes?/u);
  await expect(entries.nth(1)).toContainText(/\d+ nodes?/u);

  await entries.first().getByRole('button', { name: /Open backup from/u }).click();
  await expect(
    leftPane.getByRole('combobox', { name: 'Explorer data source' }).locator('option:checked')
  ).toContainText('Local backup');
  await expect(leftPane.getByText('First post-backup group', { exact: true })).toBeVisible();
  await expect(leftPane.getByText('Second post-backup group', { exact: true })).toHaveCount(0);

  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect(rightPane.getByText('Second post-backup group', { exact: true })).toBeVisible();
  await rightPane.getByTitle('Browse and restore local tree snapshots').click();
  const rightHistory = rightPane.getByRole('dialog', { name: 'Local backup history' });
  acceptNextOperationDialog(page);
  await rightHistory.getByRole('button', { name: /Restore backup from/u }).nth(1).click();
  await expect(rightPane.getByText('First post-backup group', { exact: true })).toHaveCount(0);
  await expect(rightPane.getByText('Second post-backup group', { exact: true })).toHaveCount(0);
  await expect(rightHistory.locator('li[data-created-at]')).toHaveCount(1);

  await page.reload();
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect(rightPane.getByText('First post-backup group', { exact: true })).toHaveCount(0);
  await rightPane.getByTitle('Browse and restore local tree snapshots').click();
  await expect(rightPane.getByRole('dialog', { name: 'Local backup history' }).locator('li[data-created-at]')).toHaveCount(1);
});

test('manages independent automatic and manual cloud backups in the website mocks', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  const cloudButton = leftPane.getByTitle('Manage manual and automatic remote tree backups');
  await expect(cloudButton).toHaveAttribute('data-action-status', 'none');
  await cloudButton.click();

  let cloudPanel = leftPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  await expect(cloudPanel.locator('[data-cloud-backup-attempt="none"]')).toContainText(
    'No cloud backup attempt this browser session'
  );
  await expect(cloudPanel.getByText('Connect this browser identity')).toBeVisible();
  await cloudPanel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(cloudPanel.getByText('chrome@browser-atlas.test')).toBeVisible();
  await cloudPanel.getByLabel('Backup machine label').fill('workstation');
  await cloudPanel.getByLabel('Automatic daily cloud backups').check();
  await cloudPanel.getByRole('button', { name: 'Save preferences' }).click();

  let cloudEntries = cloudPanel.locator('li[data-cloud-backup-id]');
  await expect(cloudEntries).toHaveCount(1);
  await expect(cloudEntries.first()).toContainText('Automatic · workstation');
  await expect(cloudPanel.locator('[data-cloud-backup-attempt="success"]')).toContainText(
    'Last automatic cloud backup succeeded'
  );
  await expect(cloudButton).toHaveAttribute('data-action-status', 'success');
  await cloudPanel.getByRole('button', { name: 'Close cloud backups' }).click();

  await leftPane.locator('[data-node-id="explore-root"]').click();
  await acceptNextPrompt(page, 'Cloud restore marker', () =>
    leftPane.getByTitle('Create a saved group; drag it to place it precisely').click()
  );
  const restoreMarker = leftPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'Cloud restore marker' });
  await expect(restoreMarker).toBeVisible();

  await cloudButton.click();
  cloudPanel = leftPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  await cloudPanel.getByRole('button', { name: 'Create cloud backup' }).click();
  cloudEntries = cloudPanel.locator('li[data-cloud-backup-id]');
  await expect(cloudEntries).toHaveCount(2);
  await expect(cloudEntries.filter({ hasText: 'Manual · workstation' })).toHaveCount(1);
  await cloudPanel.getByRole('button', { name: 'Close cloud backups' }).click();

  await restoreMarker.getByRole('button', { name: 'Delete Cloud restore marker' }).click();
  await expect(restoreMarker).toHaveCount(0);

  await cloudButton.click();
  cloudPanel = leftPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  const manualBackup = cloudPanel.locator('li[data-cloud-backup-id]').filter({ hasText: 'Manual · workstation' });
  await manualBackup.getByRole('button', { name: /Open cloud backup from/u }).click();
  await expect(
    leftPane.getByRole('combobox', { name: 'Explorer data source' }).locator('option:checked')
  ).toContainText('Cloud backup');
  const openedRestoreMarker = leftPane.getByRole('treeitem', { name: /Cloud restore marker/u });
  await expect(openedRestoreMarker).toBeVisible();

  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  const projectGroup = rightPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');
  await openedRestoreMarker.dragTo(projectGroup, { targetPosition: { x: 48, y: 10 } });
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Browser Atlas project')).toContain('Cloud restore marker');

  const rightCloudButton = rightPane.getByTitle('Manage manual and automatic remote tree backups');
  await rightCloudButton.click();
  cloudPanel = rightPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  const restorableManualBackup = cloudPanel
    .locator('li[data-cloud-backup-id]')
    .filter({ hasText: 'Manual · workstation' });
  acceptNextOperationDialog(page);
  await restorableManualBackup.getByRole('button', { name: /Restore cloud backup from/u }).click();
  await expect(rightPane.getByText('Cloud restore marker', { exact: true })).toBeVisible();
  await expect(cloudPanel.locator('li[data-cloud-backup-id]')).toHaveCount(2);

  await cloudPanel.getByLabel('Automatic daily cloud backups').uncheck();
  await cloudPanel.getByRole('button', { name: 'Save preferences' }).click();
  const automaticBackup = cloudPanel.locator('li[data-cloud-backup-id]').filter({ hasText: 'Automatic · workstation' });
  acceptNextOperationDialog(page);
  await automaticBackup.getByRole('button', { name: /Delete cloud backup from/u }).click();
  await expect(cloudPanel.locator('li[data-cloud-backup-id]')).toHaveCount(1);

  await page.reload();
  await rightPane.getByRole('tab', { name: 'Explore' }).click();
  await expect(rightPane.getByText('Cloud restore marker', { exact: true })).toBeVisible();
  await rightCloudButton.click();
  cloudPanel = rightPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  await expect(cloudPanel.getByText('chrome@browser-atlas.test')).toBeVisible();
  await expect(cloudPanel.getByLabel('Backup machine label')).toHaveValue('workstation');
  await expect(cloudPanel.getByLabel('Automatic daily cloud backups')).not.toBeChecked();
  await expect(cloudPanel.locator('li[data-cloud-backup-id]')).toHaveCount(1);
  await cloudPanel.getByRole('button', { name: 'Close cloud backups' }).click();

  await rightPane.getByLabel('Explorer data source').selectOption({ label: 'Firefox (mock)' });
  await expect(rightCloudButton).toHaveAttribute('data-action-status', 'none');
  await rightCloudButton.click();
  cloudPanel = rightPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  await expect(cloudPanel.locator('[data-cloud-backup-attempt="none"]')).toBeVisible();
  await expect(cloudPanel.getByText('Connect this browser identity')).toBeVisible();
  await cloudPanel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(cloudPanel.getByText('firefox@browser-atlas.test')).toBeVisible();
  await expect(cloudPanel.getByText('No cloud backups yet.')).toBeVisible();
});

test('shows the latest failed mock cloud attempt for the current browser session', async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    sessionStorage.setItem(storageKey, JSON.stringify({
      status: 'failure',
      attemptedAt: Date.now(),
      mode: 'automatic',
      message: 'Simulated mock provider outage'
    }));
  }, { storageKey: MOCK_CLOUD_ATTEMPT_STORAGE_KEY });
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const cloudButton = leftPane.getByTitle('Manage manual and automatic remote tree backups');
  await expect(cloudButton).toHaveAttribute('data-action-status', 'failure');
  await cloudButton.click();
  const attempt = leftPane.locator('[data-cloud-backup-attempt="failure"]');
  await expect(attempt).toContainText('Last automatic cloud backup failed');
  await expect(attempt).toContainText('Simulated mock provider outage');

  await page.reload();
  await expect(cloudButton).toHaveAttribute('data-action-status', 'failure');
});

test('opens original Tabs Outliner tree exports as editable localhost documents', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  await leftPane.locator('input[type="file"]').setInputFiles({
    name: 'legacy-tabs-outliner.tree',
    mimeType: 'application/json',
    buffer: await readFile(new URL('../e2e/fixtures/legacy-tabs-outliner.tree', import.meta.url))
  });

  const legacyWindow = leftPane.locator('[data-node-id="explore-document-node-1"]');
  await expect(legacyWindow).toContainText('Legacy research window');
  await expect(leftPane.getByRole('link', { name: 'Legacy project page' })).toHaveCount(0);
  await legacyWindow.getByRole('button', { name: 'Expand node' }).click();
  await expect(leftPane.getByRole('link', { name: 'Legacy project page' })).toHaveAttribute(
    'href',
    'https://example.com/legacy-project'
  );
  await expect(leftPane.locator('[data-node-id="explore-document-node-3"]')).toContainText('Legacy references');
  await expect(leftPane.locator('[data-node-id="explore-document-node-4"]')).toContainText('Imported legacy note');
  await expect(leftPane.locator('[data-node-id="explore-document-node-5"]')).toContainText('┄┄┄┄');
  const protectedDocumentTitle = leftPane
    .locator('[data-node-id="explore-document-node-6"] span.truncate')
    .first();
  await expect(protectedDocumentTitle).toHaveCSS('color', 'rgb(52, 96, 170)');
});

test('browses and selectively restores deleted hierarchies in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const root = leftPane.locator('[data-node-id="explore-root"]');

  await root.click();
  await acceptNextPrompt(page, 'First deleted history group', () =>
    leftPane.getByTitle('Create a saved group').click()
  );
  await root.click();
  await acceptNextPrompt(page, 'Second deleted history group', () =>
    leftPane.getByTitle('Create a saved group').click()
  );
  const firstGroup = leftPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'First deleted history group' });
  const secondGroup = leftPane
    .locator('[data-node-id^="explore-saved-group-"]')
    .filter({ hasText: 'Second deleted history group' });

  await firstGroup.getByRole('button', { name: 'Delete First deleted history group' }).click();
  await secondGroup.getByRole('button', { name: 'Delete Second deleted history group' }).click();
  await leftPane.getByTitle('Browse and restore deleted hierarchies').click();

  const history = leftPane.getByRole('dialog', { name: 'Deleted items history' });
  const entries = history.locator('li[data-deletion-id]');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText('Second deleted history group');
  await expect(entries.nth(1)).toContainText('First deleted history group');
  await expect(entries.nth(1)).toContainText('1 node');
  await expect(entries.nth(1)).toContainText('complete hierarchy');

  await history.getByRole('button', { name: 'Restore deleted First deleted history group' }).click();
  await expect(firstGroup).toBeVisible();
  await expect(secondGroup).toHaveCount(0);
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Second deleted history group');

  await page.reload();
  await expect(firstGroup).toBeVisible();
  await expect(secondGroup).toHaveCount(0);
});

test('supports save, delete, undo, cloud backup, and save-all keyboard shortcuts', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await liveTab.click();
  await liveTab.press('Backspace');

  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-live-tab-solid"]');
  await expect(savedTab).toBeVisible();
  await savedTab.focus();
  await savedTab.press('Delete');
  await expect(savedTab).toHaveCount(0);

  const root = leftPane.locator('[data-node-id="explore-root"]');
  await root.click();
  await root.press('Control+z');
  await expect(savedTab).toBeVisible();

  await leftPane.getByTitle('Manage manual and automatic remote tree backups').click();
  const cloudPanel = leftPane.getByRole('dialog', { name: 'Mock Cloud Drive backups' });
  await cloudPanel.getByRole('button', { name: 'Connect', exact: true }).click();
  await cloudPanel.getByRole('button', { name: 'Close cloud backups' }).click();
  await root.press('Control+b');
  await expect.poll(() => readMockCloudBackupCount(page)).toBeGreaterThan(0);

  acceptNextOperationDialog(page);
  await root.press('q');
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(0);
});

test('supports original note placement shortcuts and page navigation in the website mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const visibleRows = leftPane.getByRole('treeitem');
  const root = leftPane.locator('[data-node-id="explore-root"]');
  const tenthRowId = await visibleRows.nth(10).getAttribute('data-node-id');
  await root.focus();
  await root.press('PageDown');
  await expect(leftPane.locator(`[data-node-id="${tenthRowId}"]`)).toBeFocused();
  await leftPane.locator(`[data-node-id="${tenthRowId}"]`).press('PageUp');
  await expect(root).toBeFocused();

  const separator = leftPane.locator('[data-node-id="explore-saved-separator-mock-separator"]');
  await pressOrganizerShortcut(page, separator, 'Shift+Enter', 'Before separator');
  await pressOrganizerShortcut(page, separator, 'Enter', 'After separator');

  const savedTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]');
  await pressOrganizerShortcut(page, savedTab, 'Insert', 'Last child note');
  await pressOrganizerShortcut(page, savedTab, 'Alt+Insert', 'First child note');

  const savedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]');
  await pressOrganizerShortcut(page, savedWindow, 'Shift+Alt+Enter', 'Window wrapper');
  await pressOrganizerShortcut(page, savedWindow, 'Alt+Enter', 'Tree ending');

  const crashedWindow = leftPane.locator('[data-node-id="explore-saved-window-mock-crashed-window"]');
  await pressOrganizerShortcut(page, crashedWindow, 'Shift+g', 'Group before crash');
  await selectTreeRow(crashedWindow);
  await crashedWindow.press('l');

  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'Before separator',
    'separator:1',
    'After separator',
    'Window wrapper'
  ]);
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-tab-design')).toEqual([
    'First child note',
    'Last child note'
  ]);
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Window wrapper')).toEqual(['Reference session']);
  await expect.poll(() => readMockRootLabels(page)).toEqual([
    'Research window (focused)',
    'Reading window',
    'Browser Atlas project',
    'Group before crash',
    'Recovered · Previous research session',
    'separator:0',
    'Tree ending'
  ]);

  await page.reload();
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-tab-design')).toEqual([
    'First child note',
    'Last child note'
  ]);
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Window wrapper')).toEqual(['Reference session']);
});

test('moves persistent hierarchies with the original structural keyboard shortcuts', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const note = leftPane.locator('[data-node-id="explore-saved-note-mock-note-next"]');
  const separator = leftPane.locator('[data-node-id="explore-saved-separator-mock-separator"]');

  await selectTreeRow(note);
  await note.press('Control+End');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'separator:1',
    'Reference session',
    'Next: persistent tree and crash recovery'
  ]);

  await selectTreeRow(note);
  await note.press('Control+Home');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);

  await selectTreeRow(note);
  await note.press('Control+ArrowDown');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'separator:1',
    'Next: persistent tree and crash recovery',
    'Reference session'
  ]);
  await selectTreeRow(note);
  await note.press('Control+ArrowUp');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);

  await selectTreeRow(separator);
  await separator.press('Tab');
  await expect.poll(() => readMockChildLabels(page, 'mock-note-next')).toEqual([
    'Tabs Outliner architecture notes',
    'separator:1'
  ]);
  await selectTreeRow(separator);
  await separator.press('Shift+Tab');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);

  await selectTreeRow(separator);
  await separator.press('Control+ArrowRight');
  await expect.poll(() => hasMockParentChild(page, 'mock-note-next', 'mock-separator')).toBe(true);
  await selectTreeRow(separator);
  await separator.press('Control+ArrowLeft');
  await expect.poll(() => hasMockParentChild(page, 'mock-saved-project', 'mock-separator')).toBe(true);

  const designTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]');
  await selectTreeRow(designTab);
  await designTab.press('Control+ArrowUp');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Tabs Outliner architecture notes',
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);
  await selectTreeRow(designTab);
  await designTab.press('Control+ArrowDown');
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'Tabs Outliner architecture notes',
    'separator:1',
    'Reference session'
  ]);
  await selectTreeRow(designTab);
  await designTab.press('Tab');
  await expect.poll(() => hasMockParentChild(page, 'mock-note-next', 'mock-saved-tab-design')).toBe(true);

  const liveTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await selectTreeRow(liveTab);
  await liveTab.press('Tab');
  await expect.poll(() => hasMockParentChild(page, 'mock-live-tab-atlas', 'mock-live-tab-solid')).toBe(true);
  await selectTreeRow(liveTab);
  await liveTab.press('Shift+Tab');
  await expect.poll(() => hasMockParentChild(page, 'mock-live-window-research', 'mock-live-tab-solid')).toBe(true);

  await selectTreeRow(designTab);
  await designTab.press('e');
  await expect.poll(async () => (await readMockRootLabels(page)).at(-1)).toBe('Browser Atlas project');

  await page.reload();
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);
  await expect.poll(async () => (await readMockRootLabels(page)).at(-1)).toBe('Browser Atlas project');
  await expect.poll(() => hasMockParentChild(page, 'mock-live-window-research', 'mock-live-tab-solid')).toBe(true);
});

test('flattens tabs without crossing organizers and includes nested organizers when collapsed', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const project = leftPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');

  await selectTreeRow(project);
  await project.press('/');
  await expect.poll(() => hasMockParentChild(page, 'mock-saved-project', 'mock-saved-tab-design')).toBe(true);

  const chromeTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-chrome"]');
  const firefoxTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-firefox"]');
  await firefoxTab.dragTo(chromeTab, { targetPosition: { x: 48, y: 10 } });
  await expect.poll(() => hasMockParentChild(page, 'mock-saved-tab-chrome', 'mock-saved-tab-firefox')).toBe(true);

  await project.getByRole('button', { name: 'Collapse node' }).click();
  await selectTreeRow(project);
  await project.press('/');
  await expect.poll(() => hasMockParentChild(page, 'mock-saved-window-reference', 'mock-saved-tab-firefox')).toBe(true);
  await page.reload();
  await expect.poll(() => hasMockParentChild(page, 'mock-saved-project', 'mock-saved-tab-design')).toBe(true);
  await expect.poll(() => hasMockParentChild(page, 'mock-saved-window-reference', 'mock-saved-tab-firefox')).toBe(true);
});

test('reveals and focuses the current mock browser window from the toolbar', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const targetWindow = leftPane.locator('[data-node-id="explore-window-1002"]');
  await leftPane.locator('[data-node-id="explore-tab-2003"] a').dblclick();
  await expect.poll(() => readFocusedMockWindowId(page)).toBe(1002);

  const root = leftPane.locator('[data-node-id="explore-root"]');
  await root.getByRole('button', { name: 'Collapse node' }).click();
  await expect(targetWindow).toHaveCount(0);
  await leftPane.getByTitle('Focus the current browser window').click();

  await expect(targetWindow).toBeVisible();
  await expect(targetWindow).toHaveAttribute('aria-selected', 'true');
  await expect(targetWindow).toBeFocused();
});

test('scrolls to the previous open window and undoes the scroll in the website mock', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 180 });
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const scroller = leftPane.getByRole('tabpanel');
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForTimeout(300);
  const startingPosition = await scroller.evaluate((element) => element.scrollTop);

  await leftPane.dispatchEvent('keydown', { key: 'w' });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeLessThan(startingPosition);

  await leftPane.dispatchEvent('keydown', { key: 's' });
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(startingPosition);
});

test('clones backend, source, expansion, and scroll state between mock panes', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 180 });
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const rightPane = page.getByRole('region', { name: 'Right explorer pane' });
  const leftScroller = leftPane.getByRole('tabpanel');
  const rightScroller = rightPane.getByRole('tabpanel');
  await rightPane.getByRole('combobox', { name: 'Explorer data source' }).selectOption({ label: 'Right file' });
  const leftProject = leftPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');
  await leftProject.getByRole('button', { name: 'Collapse node' }).click();
  await leftScroller.evaluate((element) => {
    element.scrollTop = 120;
  });
  const leftPosition = await leftScroller.evaluate((element) => element.scrollTop);

  await leftPane.dispatchEvent('keydown', { key: 'c' });
  await expect(rightPane.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await expect(rightPane.getByRole('combobox', { name: 'Explorer data source' })).toHaveValue(
    await leftPane.getByRole('combobox', { name: 'Explorer data source' }).inputValue()
  );
  const rightProject = rightPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');
  await expect(rightProject).toHaveAttribute('aria-expanded', 'false');
  await expect(rightPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]')).toHaveCount(0);
  await expect.poll(() => rightScroller.evaluate((element) => element.scrollTop)).toBe(leftPosition);

  await rightProject.getByRole('button', { name: 'Expand node' }).click();
  await rightScroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await rightPane.getByTitle('Clone this view into the other pane (C)').click();
  await expect(leftProject).toHaveAttribute('aria-expanded', 'true');
  await expect(leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]')).toBeVisible();
  await expect.poll(() => leftScroller.evaluate((element) => element.scrollTop)).toBe(0);
});

test('uses in-app confirmation and supports persistent delete Undo and Redo', async ({ page }) => {
  const nativeDialogs: string[] = [];
  page.on('dialog', (dialog) => {
    nativeDialogs.push(dialog.type());
    void dialog.dismiss();
  });
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  await expect(
    leftPane.locator(
      '[data-node-id="explore-saved-window-mock-crashed-window"] [data-transient-status="crash-recovered"]'
    )
  ).toBeVisible();
  await expect(
    leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"] [data-transient-status]')
  ).toHaveCount(0);
  acceptNextOperationDialog(page);
  await leftPane.getByTitle('Save and close all other browser windows').click();
  await expect(leftPane.locator('[data-node-id^="explore-window-"]')).toHaveCount(0);
  await expect(leftPane.getByRole('button', { name: 'Restore Research window (focused)' })).toBeVisible();
  const recentlySavedWindow = leftPane.locator(
    '[data-node-id="explore-saved-window-mock-live-window-research"]'
  );
  await expect(recentlySavedWindow.locator('[data-transient-status="recently-saved"]')).toBeVisible();
  await expect(recentlySavedWindow.locator('[title*="highlighted until the browser exits"]')).toBeVisible();
  await page.reload();
  await expect(recentlySavedWindow.locator('[data-transient-status="recently-saved"]')).toBeVisible();

  const savedDesignTab = leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]');
  await savedDesignTab.getByRole('button', { name: 'Delete Tabs Outliner architecture notes' }).click();
  await expect(savedDesignTab).toHaveCount(0);
  await leftPane.getByTitle('Undo the latest persistent tree change').click();
  await expect(savedDesignTab).toBeVisible();
  await leftPane.getByTitle('Redo the latest undone persistent tree change').click();
  await expect(savedDesignTab).toHaveCount(0);
  await leftPane.locator('[data-node-id="explore-root"]').press('Control+z');
  await expect(savedDesignTab).toBeVisible();
  await page.reload();
  await expect(savedDesignTab).toBeVisible();
  await expect(leftPane.getByTitle('Undo the latest persistent tree change')).toBeDisabled();
  await expect(nativeDialogs).toEqual([]);
});

test('promotes children of expanded deletions, removes collapsed subtrees, and undoes both in the mock', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const project = leftPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');
  const menu = page.getByRole('menu', { name: 'Tree commands' });

  await project.click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: /Delete node; keep children/ })).toBeVisible();
  await menu.press('Escape');

  await selectTreeRow(project);
  await project.press('Delete');
  await expect(project).toHaveCount(0);
  await expect.poll(() => readMockChildLabels(page, null)).toEqual(
    expect.arrayContaining(['Next: persistent tree and crash recovery', 'separator:1', 'Reference session'])
  );

  await leftPane.getByTitle('Undo the latest persistent tree change').click();
  await expect(project).toBeVisible();
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toEqual([
    'Next: persistent tree and crash recovery',
    'separator:1',
    'Reference session'
  ]);

  await project.getByRole('button', { name: 'Collapse node' }).click();
  await project.click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: /Delete hierarchy/ })).toBeVisible();
  await menu.press('Escape');
  await selectTreeRow(project);
  await project.press('Delete');
  await expect(project).toHaveCount(0);
  await expect.poll(() => readMockChildLabels(page, null)).not.toEqual(
    expect.arrayContaining(['Next: persistent tree and crash recovery', 'Reference session'])
  );

  await leftPane.getByTitle('Undo the latest persistent tree change').click();
  await expect(project).toBeVisible();
  await page.reload();
  await expect(project).toBeVisible();
  if ((await project.getAttribute('aria-expanded')) === 'false') {
    await project.getByRole('button', { name: 'Expand node' }).click();
  }
  await expect(leftPane.locator('[data-node-id="explore-saved-window-mock-saved-window-reference"]')).toBeVisible();
});

test('applies collapse-sensitive deletion to live mock tabs with inline context', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const sourceTab = leftPane.locator('[data-node-id="explore-tab-2002"]');
  await selectTreeRow(sourceTab);
  acceptNextOperationDialog(page, 'Promoted live context');
  await sourceTab.press('F2');
  const promotedNote = leftPane
    .locator('[data-node-id^="explore-saved-note-"]')
    .filter({ hasText: 'Promoted live context' });
  await expect(promotedNote).toBeVisible();

  await sourceTab.getByRole('button', { name: 'Delete SolidJS documentation' }).click();
  await expect(sourceTab).toHaveCount(0);
  await expect(promotedNote).toBeVisible();
  await expect.poll(() => readMockChildLabels(page, 'mock-live-window-research')).toContain('Promoted live context');

  const collapsedTab = leftPane.locator('[data-node-id="explore-tab-2003"]');
  await selectTreeRow(collapsedTab);
  acceptNextOperationDialog(page, 'Discarded live context');
  await collapsedTab.press('F2');
  const discardedNote = leftPane
    .locator('[data-node-id^="explore-saved-note-"]')
    .filter({ hasText: 'Discarded live context' });
  await expect(discardedNote).toBeVisible();
  await collapsedTab.getByRole('button', { name: 'Collapse node' }).click();
  await collapsedTab.getByRole('button', { name: 'Delete MDN WebExtensions' }).click();
  await page.reload();
  await expect(collapsedTab).toHaveCount(0);
  await expect(discardedNote).toHaveCount(0);
});

test('searches, prints, and exports all visible mock rows with the original global shortcuts', async ({ page }) => {
  await page.goto('/browser-atlas');
  const leftPane = page.getByRole('region', { name: 'Left explorer pane' });
  const root = leftPane.locator('[data-node-id="explore-root"]');
  const project = leftPane.locator('[data-node-id="explore-saved-group-mock-saved-project"]');
  await project.getByRole('button', { name: 'Collapse node' }).click();

  await root.focus();
  await root.press(`${CLIPBOARD_MODIFIER}+f`);
  const search = leftPane.getByRole('searchbox', { name: 'Find visible nodes' });
  await expect(search).toBeFocused();
  await search.fill('SolidJS documentation');
  await expect(leftPane.getByRole('status')).toHaveText('1 / 1');
  await expect(leftPane.locator('[data-node-id="explore-tab-2002"]')).toHaveAttribute('aria-selected', 'true');

  await search.fill('Tabs Outliner architecture notes');
  await expect(leftPane.getByRole('status')).toHaveText('0 / 0');
  await search.press('Escape');
  await expect(search).toHaveCount(0);

  await project.getByRole('button', { name: 'Expand node' }).click();
  await root.focus();
  await root.press(`${CLIPBOARD_MODIFIER}+f`);
  await search.fill('Tabs Outliner architecture notes');
  await expect(leftPane.getByRole('status')).toHaveText('1 / 1');
  await expect(leftPane.locator('[data-node-id="explore-saved-tab-mock-saved-tab-design"]')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await search.press('Escape');
  await project.getByRole('button', { name: 'Collapse node' }).click();

  await page.evaluate(() => {
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
  const printText = await page.evaluate(() => {
    const browser = globalThis as unknown as { sessionStorage: { getItem: (key: string) => string | null } };
    return browser.sessionStorage.getItem('browserAtlas.e2e.printText') ?? '';
  });
  expect(printText).toContain('SolidJS documentation');
  expect(printText).not.toContain('Tabs Outliner architecture notes');

  const downloadPromise = page.waitForEvent('download');
  await root.press(`${CLIPBOARD_MODIFIER}+s`);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Chrome (mock)-explore.html');
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error('Playwright did not expose the exported HTML path.');
  }
  const html = await readFile(downloadPath, 'utf8');
  expect(html).toContain('<title>Chrome (mock) · Explore</title>');
  expect(html).toContain('id="browser-atlas-document"');
  expect(html).toContain('SolidJS documentation');
  expect(html).not.toContain('Tabs Outliner architecture notes');

  await dropExternalData(project, { 'text/html': html });
  await expect.poll(() => readMockChildLabels(page, 'mock-saved-project')).toContain('Dropped links');
  await expect.poll(() => readMockChildLabelsByLabel(page, 'Dropped links')).toContain('Research window (focused)');

  await leftPane.locator('input[type="file"]').setInputFiles({
    name: 'Chrome (mock)-explore.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html)
  });
  await expect(
    leftPane.getByRole('combobox', { name: 'Explorer data source' }).locator('option:checked')
  ).toContainText('Chrome (mock)-explore.html');
  const importedWindowTitle = leftPane.getByText('Research window (focused)', { exact: true });
  const importedWindowRow = importedWindowTitle.locator('xpath=ancestor::*[@role="treeitem"][1]');
  const importedTabRow = leftPane
    .getByText('SolidJS documentation', { exact: true })
    .locator('xpath=ancestor::*[@role="treeitem"][1]');
  await expect(importedWindowTitle).toBeVisible();
  expect(Number(await importedTabRow.getAttribute('aria-level'))).toBeGreaterThan(
    Number(await importedWindowRow.getAttribute('aria-level'))
  );
  await expect(leftPane.getByText('Tabs Outliner architecture notes', { exact: true })).toHaveCount(0);
});

async function readMockTabWindow(
  page: Page,
  persistentTabId: string
): Promise<number | null> {
  return page.evaluate(
    ({ storageKey, tabId }) => {
      const serialized = localStorage.getItem(storageKey);
      if (!serialized) {
        return null;
      }
      const document: unknown = JSON.parse(serialized);
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return null;
      }
      return findTabWindow(document.roots);

      function findTabWindow(nodes: unknown[]): number | null {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('id' in node) || !('children' in node)) {
            continue;
          }
          if (node.id === tabId && 'binding' in node && typeof node.binding === 'object' && node.binding !== null) {
            return 'windowId' in node.binding && typeof node.binding.windowId === 'number' ? node.binding.windowId : null;
          }
          if (Array.isArray(node.children)) {
            const descendant = findTabWindow(node.children);
            if (descendant !== null) {
              return descendant;
            }
          }
        }
        return null;
      }
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, tabId: persistentTabId }
  );
}

async function readMockBindingState(page: Page, persistentNodeId: string): Promise<string | null> {
  return page.evaluate(({ storageKey, nodeId }) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) {
      return null;
    }
    const document: unknown = JSON.parse(serialized);
    if (!document || typeof document !== 'object' || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }

    function find(nodes: unknown[]): string | null {
      for (const value of nodes) {
        if (!value || typeof value !== 'object') {
          continue;
        }
        const node = value as { id?: unknown; binding?: unknown; children?: unknown };
        if (
          node.id === nodeId &&
          node.binding &&
          typeof node.binding === 'object' &&
          'state' in node.binding &&
          typeof node.binding.state === 'string'
        ) {
          return node.binding.state;
        }
        if (Array.isArray(node.children)) {
          const descendant = find(node.children);
          if (descendant) {
            return descendant;
          }
        }
      }
      return null;
    }

    return find(document.roots);
  }, { storageKey: MOCK_TREE_STORAGE_KEY, nodeId: persistentNodeId });
}

type MockWindowState = Readonly<{
  state: string;
  windowId: number | null;
  bounds: Readonly<{ left: number; top: number; width: number; height: number }> | null;
}>;

async function readMockWindowState(page: Page, persistentNodeId: string): Promise<MockWindowState | null> {
  return page.evaluate(({ storageKey, nodeId }) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) {
      return null;
    }
    const document: unknown = JSON.parse(serialized);
    if (!document || typeof document !== 'object' || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }
    return find(document.roots);

    function find(nodes: unknown[]): MockWindowState | null {
      for (const value of nodes) {
        if (!value || typeof value !== 'object') {
          continue;
        }
        const node = value as { id?: unknown; bounds?: unknown; binding?: unknown; children?: unknown };
        if (node.id === nodeId && node.binding && typeof node.binding === 'object' && 'state' in node.binding) {
          const binding = node.binding as { state?: unknown; windowId?: unknown };
          const bounds = node.bounds as Partial<Record<'left' | 'top' | 'width' | 'height', unknown>> | undefined;
          return {
            state: typeof binding.state === 'string' ? binding.state : '',
            windowId: typeof binding.windowId === 'number' ? binding.windowId : null,
            bounds:
              bounds &&
              typeof bounds.left === 'number' &&
              typeof bounds.top === 'number' &&
              typeof bounds.width === 'number' &&
              typeof bounds.height === 'number'
                ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
                : null
          };
        }
        if (Array.isArray(node.children)) {
          const descendant = find(node.children);
          if (descendant) {
            return descendant;
          }
        }
      }
      return null;
    }
  }, { storageKey: MOCK_TREE_STORAGE_KEY, nodeId: persistentNodeId });
}

async function readMockGoogleDocState(
  page: Page
): Promise<{ state: string; keepOnClose: boolean } | null> {
  return page.evaluate(({ storageKey, url }) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) {
      return null;
    }
    const document: unknown = JSON.parse(serialized);
    if (!document || typeof document !== 'object' || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }

    function find(nodes: unknown[]): { state: string; keepOnClose: boolean } | null {
      for (const value of nodes) {
        if (!value || typeof value !== 'object') {
          continue;
        }
        const node = value as { url?: unknown; keepOnClose?: unknown; binding?: unknown; children?: unknown };
        const binding = node.binding;
        if (
          node.url === url &&
          binding &&
          typeof binding === 'object' &&
          'state' in binding &&
          typeof binding.state === 'string'
        ) {
          return { state: binding.state, keepOnClose: node.keepOnClose === true };
        }
        if (Array.isArray(node.children)) {
          const descendant = find(node.children);
          if (descendant) {
            return descendant;
          }
        }
      }
      return null;
    }

    return find(document.roots);
  }, { storageKey: MOCK_TREE_STORAGE_KEY, url: 'https://docs.google.com/document/create' });
}

async function readMockCloudBackupCount(page: Page): Promise<number> {
  return page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) {
      return 0;
    }
    const backups: unknown = JSON.parse(serialized);
    return Array.isArray(backups) ? backups.length : 0;
  }, MOCK_CLOUD_BACKUPS_STORAGE_KEY);
}

async function readFocusedMockWindowId(page: Page): Promise<number | null> {
  return page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) {
      return null;
    }
    const document: unknown = JSON.parse(serialized);
    if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
      return null;
    }
    return findFocusedWindow(document.roots);

    function findFocusedWindow(nodes: unknown[]): number | null {
      for (const node of nodes) {
        if (typeof node !== 'object' || node === null || !('children' in node) || !Array.isArray(node.children)) {
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
          'focused' in node.binding &&
          node.binding.focused === true &&
          'windowId' in node.binding &&
          typeof node.binding.windowId === 'number'
        ) {
          return node.binding.windowId;
        }
        const descendant = findFocusedWindow(node.children);
        if (descendant !== null) {
          return descendant;
        }
      }
      return null;
    }
  }, MOCK_TREE_STORAGE_KEY);
}

async function readMockLiveTabWindowsByUrl(page: Page, url: string): Promise<number[]> {
  return page.evaluate(
    ({ storageKey, expectedUrl }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return [];
      }
      return collectWindows(document.roots).sort((left, right) => left - right);

      function collectWindows(nodes: unknown[]): number[] {
        const windowIds: number[] = [];
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null) {
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
            'windowId' in node.binding &&
            typeof node.binding.windowId === 'number'
          ) {
            windowIds.push(node.binding.windowId);
          }
          const children = 'children' in node && Array.isArray(node.children) ? node.children : [];
          windowIds.push(...collectWindows(children));
        }
        return windowIds;
      }
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedUrl: url }
  );
}

async function hasMockParentChild(
  page: Page,
  parentId: string,
  childId: string
): Promise<boolean> {
  return page.evaluate(
    ({ storageKey, expectedParentId, expectedChildId }) => {
      const serialized = localStorage.getItem(storageKey);
      if (!serialized) {
        return false;
      }
      const document: unknown = JSON.parse(serialized);
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return false;
      }
      return containsRelationship(document.roots);

      function containsRelationship(nodes: unknown[]): boolean {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('id' in node) || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (
            node.id === expectedParentId &&
            children.some(
              (child) => typeof child === 'object' && child !== null && 'id' in child && child.id === expectedChildId
            )
          ) {
            return true;
          }
          if (containsRelationship(children)) {
            return true;
          }
        }
        return false;
      }
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedParentId: parentId, expectedChildId: childId }
  );
}

async function hasMockParentKind(page: Page, parentId: string, childKind: string): Promise<boolean> {
  return page.evaluate(
    ({ storageKey, expectedParentId, expectedChildKind }) => {
      const serialized = localStorage.getItem(storageKey);
      if (!serialized) {
        return false;
      }
      const document: unknown = JSON.parse(serialized);
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return false;
      }
      return containsRelationship(document.roots);

      function containsRelationship(nodes: unknown[]): boolean {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('id' in node) || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (
            node.id === expectedParentId &&
            children.some(
              (child) =>
                typeof child === 'object' && child !== null && 'kind' in child && child.kind === expectedChildKind
            )
          ) {
            return true;
          }
          if (containsRelationship(children)) {
            return true;
          }
        }
        return false;
      }
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedParentId: parentId, expectedChildKind: childKind }
  );
}

async function dropExternalData(target: ReturnType<Page['locator']>, values: Readonly<Record<string, string>>): Promise<void> {
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

async function dispatchClipboardWrite(
  target: ReturnType<Page['locator']>,
  eventType: 'copy' | 'cut'
): Promise<Record<string, string>> {
  return target.evaluate((element, type) => {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error('The target is not attached to a browser window.');
    }
    const clipboardData = new view.DataTransfer();
    element.dispatchEvent(
      new view.ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData })
    );
    return Object.fromEntries([...clipboardData.types].map((dataType) => [dataType, clipboardData.getData(dataType)]));
  }, eventType);
}

async function dispatchDragWrite(target: ReturnType<Page['locator']>): Promise<Record<string, string>> {
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

async function selectTreeRow(target: ReturnType<Page['locator']>): Promise<void> {
  await target.focus();
  await target.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      throw new Error('The tree row is not attached to a browser window.');
    }
    element.dispatchEvent(new view.MouseEvent('click', { bubbles: true }));
  });
}

async function copyDragTo(
  page: Page,
  source: ReturnType<Page['locator']>,
  target: ReturnType<Page['locator']>
): Promise<void> {
  await page.keyboard.down('Alt');
  try {
    await source.dragTo(target, { targetPosition: { x: 48, y: 10 } });
  } finally {
    await page.keyboard.up('Alt');
  }
}

async function modifierCopyDragTo(
  page: Page,
  source: ReturnType<Page['locator']>,
  target: ReturnType<Page['locator']>
): Promise<void> {
  const targetBounds = await target.boundingBox();
  if (!targetBounds) {
    throw new Error('The modifier-copy target is not visible.');
  }
  const dataTransfer = await page.evaluateHandle(() => {
    const DataTransferConstructor: unknown = Reflect.get(globalThis, 'DataTransfer');
    if (typeof DataTransferConstructor !== 'function') {
      throw new Error('Chromium does not expose DataTransfer.');
    }
    return Reflect.construct(DataTransferConstructor, []);
  });
  const eventInit = {
    dataTransfer,
    altKey: true,
    clientX: targetBounds.x + Math.min(48, targetBounds.width / 2),
    clientY: targetBounds.y + Math.min(10, targetBounds.height / 2)
  };
  await source.dispatchEvent('dragstart', eventInit);
  await target.dispatchEvent('dragenter', eventInit);
  await target.dispatchEvent('dragover', eventInit);
  await target.dispatchEvent('drop', eventInit);
  await source.dispatchEvent('dragend', eventInit);
  await dataTransfer.dispose();
}

async function acceptNextPrompt(page: Page, value: string, action: () => Promise<void>): Promise<void> {
  await action();
  const dialog = page.locator('[data-browser-atlas-operation-dialog]');
  await dialog.locator('input[aria-label="Name"]').fill(value);
  await dialog.locator('button[type="submit"]').click();
}

async function pressOrganizerShortcut(
  page: Page,
  target: ReturnType<Page['locator']>,
  shortcut: string,
  title: string
): Promise<void> {
  await selectTreeRow(target);
  await acceptNextPrompt(page, title, () => target.press(shortcut));
}

function acceptNextOperationDialog(page: Page, value?: string): void {
  void page.locator('[data-browser-atlas-operation-dialog]').waitFor().then(async () => {
    const dialog = page.locator('[data-browser-atlas-operation-dialog]');
    if (value !== undefined) {
      await dialog.locator('input[aria-label="Name"]').fill(value);
    }
    await dialog.locator('button[type="submit"]').click();
  });
}

async function readMockRootLabels(page: Page): Promise<string[]> {
  return readMockChildLabels(page, null);
}

async function readMockTabBindingCounts(
  page: Page,
  windowNodeId: string,
  url: string
): Promise<Readonly<{ live: number; saved: number }>> {
  return page.evaluate(
    ({ storageKey, expectedWindowNodeId, expectedUrl }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return { live: 0, saved: 0 };
      }
      const window = findNode(document.roots, expectedWindowNodeId);
      return countBindings(childrenOf(window));

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
            if ('binding' in node && isLiveBinding(node.binding)) {
              live += 1;
            } else {
              saved += 1;
            }
          }
        }
        return { live, saved };
      }

      function isLiveBinding(binding: unknown): boolean {
        return typeof binding === 'object' && binding !== null && 'state' in binding && binding.state === 'live';
      }

      function findNode(nodes: unknown[], id: string): unknown {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null) {
            continue;
          }
          if ('id' in node && node.id === id) {
            return node;
          }
          const descendant = findNode(childrenOf(node), id);
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
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedWindowNodeId: windowNodeId, expectedUrl: url }
  );
}

async function readMockPersistentWindowId(page: Page, windowNodeId: string): Promise<number> {
  const windowId = await page.evaluate(
    ({ storageKey, expectedWindowNodeId }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return null;
      }
      return findWindowId(document.roots);

      function findWindowId(nodes: unknown[]): number | null {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null) {
            continue;
          }
          if (
            'id' in node &&
            node.id === expectedWindowNodeId &&
            'binding' in node &&
            typeof node.binding === 'object' &&
            node.binding !== null &&
            'state' in node.binding &&
            node.binding.state === 'live' &&
            'windowId' in node.binding &&
            typeof node.binding.windowId === 'number'
          ) {
            return node.binding.windowId;
          }
          const children = 'children' in node && Array.isArray(node.children) ? node.children : [];
          const descendant = findWindowId(children);
          if (descendant !== null) {
            return descendant;
          }
        }
        return null;
      }
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedWindowNodeId: windowNodeId }
  );
  if (windowId === null) {
    throw new Error('The mock persistent window is not live.');
  }
  return windowId;
}

async function readMockChildLabelsByLabel(page: Page, parentLabel: string): Promise<string[]> {
  return readMockChildLabels(page, { label: parentLabel });
}

async function readMockChildLabels(
  page: Page,
  parent: string | null | Readonly<{ label: string }>
): Promise<string[]> {
  return page.evaluate(
    ({ storageKey, expectedParent }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return [];
      }
      const children = expectedParent === null ? document.roots : findChildren(document.roots);
      return children.map(labelNode);

      function findChildren(nodes: unknown[]): unknown[] {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('id' in node) || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          const matches =
            typeof expectedParent === 'string'
              ? node.id === expectedParent
              : expectedParent !== null && labelNode(node) === expectedParent.label;
          if (matches) {
            return children;
          }
          const descendants = findChildren(children);
          if (descendants.length > 0) {
            return descendants;
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
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedParent: parent }
  );
}

async function countMockChildrenByTitle(page: Page, parentId: string, title: string): Promise<number> {
  return countMockChildren(page, parentId, 'title', title);
}

async function countMockNodesByLabel(page: Page, label: string): Promise<number> {
  return page.evaluate(
    ({ storageKey, expectedLabel }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
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
    },
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedLabel: label }
  );
}

async function countMockChildrenByUrl(page: Page, parentId: string, url: string): Promise<number> {
  return countMockChildren(page, parentId, 'url', url);
}

async function countMockChildren(
  page: Page,
  parentId: string,
  property: 'title' | 'url',
  value: string
): Promise<number> {
  return page.evaluate(
    ({ storageKey, expectedParentId, expectedProperty, expectedValue }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
      if (typeof document !== 'object' || document === null || !('roots' in document) || !Array.isArray(document.roots)) {
        return 0;
      }
      return findCount(document.roots);

      function findCount(nodes: unknown[]): number {
        for (const node of nodes) {
          if (typeof node !== 'object' || node === null || !('id' in node) || !('children' in node)) {
            continue;
          }
          const children = Array.isArray(node.children) ? node.children : [];
          if (node.id === expectedParentId) {
            return children.filter(
              (child) =>
                typeof child === 'object' &&
                child !== null &&
                expectedProperty in child &&
                child[expectedProperty] === expectedValue
            ).length;
          }
          const descendantCount = findCount(children);
          if (descendantCount > 0) {
            return descendantCount;
          }
        }
        return 0;
      }
    },
    {
      storageKey: MOCK_TREE_STORAGE_KEY,
      expectedParentId: parentId,
      expectedProperty: property,
      expectedValue: value
    }
  );
}

async function hasMockNoteWithTab(page: Page, noteText: string, tabUrl: string): Promise<boolean> {
  return page.evaluate(
    ({ storageKey, expectedNoteText, expectedTabUrl }) => {
      const serialized = localStorage.getItem(storageKey);
      const document: unknown = serialized ? JSON.parse(serialized) : null;
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
    { storageKey: MOCK_TREE_STORAGE_KEY, expectedNoteText: noteText, expectedTabUrl: tabUrl }
  );
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
