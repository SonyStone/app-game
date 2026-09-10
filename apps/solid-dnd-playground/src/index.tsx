/* @refresh reload */
import { createRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import 'uno.css';
import reset from '../../../packages/styles/reset.module.css';
import { routes } from './routes';

const root = document.getElementById('app');
if (!root) throw new Error('Root element not found');

const Router = createRouter({ routes: [routes] });

render(() => <Router />, root);

// Scope the utility baseline to this standalone document.
document.body.classList.add(reset.root, 'app-utilities');
