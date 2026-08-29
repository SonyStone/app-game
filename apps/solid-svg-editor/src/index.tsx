import { render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import { App } from './App';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

render(() => <App />, root);
