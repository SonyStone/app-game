import { render } from '@solidjs/web';
import GpuTextRendering from './features/viewer/GpuTextRendering';
import './standalone.css';

const container = document.getElementById('app');

if (container) {
  render(() => <GpuTextRendering />, container);
}
