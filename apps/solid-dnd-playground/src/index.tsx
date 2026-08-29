/* @refresh reload */
import { createRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import { routes } from './routes';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Root element not found');

const Router = createRouter({ routes: [routes] });

render(() => <Router />, root);
