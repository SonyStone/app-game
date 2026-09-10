import { render } from '@solidjs/web';
import reset from '../../../packages/styles/reset.module.css';
import App from './App';
import './utilities.css';

render(() => <App />, document.getElementById('root')!);

document.body.classList.add(reset.root, 'app-utilities');
