import { render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('ABR Viewer root element is missing.');
render(() => <App />, root);
