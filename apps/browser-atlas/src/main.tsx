/* @refresh reload */
import { render } from '@solidjs/web';
import 'uno.css';
import reset from '../../../packages/styles/reset.module.css';
import WebBrowserAtlas from './WebApp';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Browser Atlas root element was not found.');
}

render(() => <WebBrowserAtlas />, root);

// Scope the utility baseline to this standalone document.
document.body.classList.add(reset.root, 'app-utilities');
