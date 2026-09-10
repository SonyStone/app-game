/* @refresh reload */
import { render } from '@solidjs/web';
import 'uno.css';
import reset from '../../../../packages/styles/reset.module.css';
import { BrowserAtlas } from '../App';
import { createChromeExplorerBackend } from '../backends/chrome/createChromeExplorerBackend';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Browser Atlas extension root element was not found.');
}

render(() => <BrowserAtlas backend={createChromeExplorerBackend()} backendLabel="Chrome" />, root);

// Scope the utility baseline to this standalone document.
document.body.classList.add(reset.root, 'app-utilities');
