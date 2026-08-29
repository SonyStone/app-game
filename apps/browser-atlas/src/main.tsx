/* @refresh reload */
import { render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import WebBrowserAtlas from './WebApp';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Browser Atlas root element was not found.');
}

render(() => <WebBrowserAtlas />, root);
