/* @refresh reload */
import '@unocss/reset/tailwind.css';
import { render } from 'solid-js/web';
import 'uno.css';
import { BookmarksExplorer } from '../App';
import { createChromeExplorerBackend } from '../backends/chrome/createChromeExplorerBackend';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Bookmarks Explorer extension root element was not found.');
}

render(() => <BookmarksExplorer backend={createChromeExplorerBackend()} backendLabel="Chrome" />, root);
