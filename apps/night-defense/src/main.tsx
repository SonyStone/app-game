import { createRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import { standaloneNightDefenseRoutes } from './routes';
import styles from './main.module.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Night Defense root element was not found.');
}

const Router = createRouter({ routes: [standaloneNightDefenseRoutes] });

render(() => <Router />, root);

root.classList.add(styles.root);
