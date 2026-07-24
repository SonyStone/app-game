/* @refresh reload */
import '@unocss/reset/tailwind.css';
import { render } from 'solid-js/web';
import 'uno.css';
import WebBookmarksExplorer from './WebApp';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Bookmarks Explorer root element was not found.');
}

render(() => <WebBookmarksExplorer />, root);
