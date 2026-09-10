import { render } from '@solidjs/web';
import 'uno.css';
import { PaintApp } from './pwa/PaintApp';

/** Standalone entry uses the same editor that is mounted at /paint/studio in the playground. */
const element = document.getElementById('app');
if (!element) throw new Error('Missing application mount element.');
render(() => <PaintApp />, element);

document.body.classList.add('app-utilities');
