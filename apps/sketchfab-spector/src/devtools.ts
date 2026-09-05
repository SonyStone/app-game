/** Registers the WebGL inspector as a first-class Chrome DevTools panel. */
chrome.devtools.panels.create('Spector', 'icon.svg', 'panel.html', () => {
  document.documentElement.dataset.panelRegistered = 'true';
});
