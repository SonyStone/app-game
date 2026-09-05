import { render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import { onCleanup, onSettled } from 'solid-js';
import 'uno.css';
import { createChromeAgentClient } from './chrome-agent-client';
import { createInspectorSession } from './inspector-session';
import { SpectorDevToolsPanel } from './panel';
import './panel.css';

/** Composes browser capabilities with an owned Solid session and its presentation. */
function PanelApplication() {
  const session = createInspectorSession(createChromeAgentClient(chrome.devtools.inspectedWindow.tabId));
  onSettled(() => {
    setTheme(chrome.devtools.panels.themeName);
    chrome.devtools.panels.setThemeChangeHandler(setTheme);
  });
  onCleanup(() => chrome.devtools.panels.setThemeChangeHandler());
  return <SpectorDevToolsPanel session={session} />;
}

function setTheme(theme: chrome.devtools.panels.Theme): void {
  document.documentElement.dataset.theme = theme;
}

const root = document.querySelector('#root');
if (!root) throw new Error('The Spector panel root is missing.');
render(() => <PanelApplication />, root);
