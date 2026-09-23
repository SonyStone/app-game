import { createRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import GpuTextRendering from './features/viewer/GpuTextRendering';
import './standalone.css';

const Router = createRouter({ routes: [{ path: '*path', component: GpuTextRendering }] });

const container = document.getElementById('app');

if (container) {
  render(() => <Router />, container);
}
