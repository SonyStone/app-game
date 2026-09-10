import { render } from '@solidjs/web';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Folder tabs root element was not found.');
render(() => <App />, root);
