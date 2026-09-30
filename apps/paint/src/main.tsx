import { render } from '@solidjs/web';
import 'uno.css';
import { PaintApp } from './features/pwa/PaintApp';

/** Standalone entry: mounts the same editor that the playground embeds at /paint/studio, plus the PWA shell. */
const element = document.getElementById('app');
if (!element) {
  throw new Error('Missing application mount element.');
}

render(() => <PaintApp />, element);
document.body.classList.add('app-utilities');
