/* @refresh reload */
import '@unocss/reset/tailwind.css';
import { render } from 'solid-js/web';
import 'uno.css';
import WebBrowserAtlas from './WebApp';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Browser Atlas root element was not found.');
}

render(() => <WebBrowserAtlas />, root);
