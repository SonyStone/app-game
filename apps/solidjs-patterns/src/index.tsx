import { Router } from '@solidjs/router';
import '@unocss/reset/tailwind.css';
import { render } from 'solid-js/web';
import 'uno.css';
import { routes } from './routes';

const root = document.getElementById('app');
if (!root) throw new Error('Root element not found');

render(() => <Router>{routes}</Router>, root);
