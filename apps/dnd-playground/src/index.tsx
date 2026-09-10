/* @refresh reload */
import { render } from '@solidjs/web';
import 'uno.css';
import reset from '../../../packages/styles/reset.module.css';
import App from './App';

const root = document.getElementById('app');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);

// Scope the utility baseline to this standalone document.
document.body.classList.add(reset.root, 'app-utilities');
