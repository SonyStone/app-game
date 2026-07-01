import { Router } from '@solidjs/router';
import { render } from 'solid-js/web';
import { standaloneNightDefenseRoutes } from './routes';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Night Defense root element was not found.');
}

render(() => <Router>{standaloneNightDefenseRoutes}</Router>, root);
