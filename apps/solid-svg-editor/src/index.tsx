import { render } from '@solidjs/web';
import 'uno.css';
import reset from '../../../packages/styles/reset.module.css';
import { App } from './App';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

render(() => <App />, root);

const resetClass = reset.root;

if (!resetClass) {
  throw new Error('Reset stylesheet has no root class');
}

// Scope the utility baseline to this standalone document.
document.body.classList.add(resetClass, 'app-utilities');
