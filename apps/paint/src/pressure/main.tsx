import { render } from '@solidjs/web';
import { PressurePage } from './PressurePage';

/** Entry at /pressure.html: pen pressure calibration without the editor; see `PressurePage`. */
const element = document.getElementById('app');
if (!element) {
  throw new Error('Missing application mount element.');
}

render(() => <PressurePage />, element);
