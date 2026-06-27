/* @refresh reload */
import '@unocss/reset/tailwind.css';
import { render } from 'solid-js/web';
import 'uno.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);
