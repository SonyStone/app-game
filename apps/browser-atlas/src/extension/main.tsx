/* @refresh reload */
import { render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import { BrowserAtlas } from '../App';
import { createChromeExplorerBackend } from '../backends/chrome/createChromeExplorerBackend';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Browser Atlas extension root element was not found.');
}

render(() => <BrowserAtlas backend={createChromeExplorerBackend()} backendLabel="Chrome" />, root);
