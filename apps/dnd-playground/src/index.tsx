/* @refresh reload */
import { render } from 'solid-js/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import App from './App';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);
