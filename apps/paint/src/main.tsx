import 'uno.css';
import { render } from '@solidjs/web';
import { PaintApp } from './pwa/PaintApp';

/** Standalone entry uses the same editor that is mounted at /paint/studio in the playground. */
const element = document.getElementById('app');
if (!element) throw new Error('Missing application mount element.');
render(() => <PaintApp />, element);
