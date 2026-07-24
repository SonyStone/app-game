const explorerPageUrl = chrome.runtime.getURL('explorer.html');

chrome.action.onClicked.addListener(() => {
  void openOrFocusExplorer();
});

/** Opens the full explorer page or focuses its existing browser tab. */
async function openOrFocusExplorer(): Promise<void> {
  const [existingTab] = await chrome.tabs.query({ url: `${explorerPageUrl}*` });

  if (existingTab?.id !== undefined) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId !== undefined) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: explorerPageUrl });
}
