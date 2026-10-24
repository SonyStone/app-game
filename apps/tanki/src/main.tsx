import { createRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import 'uno.css';
import { standaloneTankiRoutes } from './routes';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Tanki root element was not found.');
}

const Router = createRouter({ routes: [standaloneTankiRoutes] });

render(() => <Router />, root);
