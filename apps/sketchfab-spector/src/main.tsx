import { render } from '@solidjs/web';
import { onCleanup, onSettled } from 'solid-js';
import 'uno.css';
import reset from '../../../packages/styles/reset.module.css';
import { createChromeAgentClient } from './chrome-agent-client';
import { createInspectorSession } from './inspector-session';
import { SpectorDevToolsPanel } from './panel';
import styles from './main.module.css';

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
  document.querySelector('#root')?.setAttribute('data-theme', theme);
}

const root = document.querySelector('#root');
if (!root) throw new Error('The Spector panel root is missing.');
render(() => <PanelApplication />, root);

// Scope the utility baseline to this standalone document.
document.body.classList.add(reset.root, 'app-utilities');

root.classList.add(styles.root);
