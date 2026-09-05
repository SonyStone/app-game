import { render } from '@solidjs/web';
import PaintStudio from './PaintStudio';

/** Standalone entry uses the same editor that is mounted at /paint/studio in the playground. */
const element = document.getElementById('app');
if (!element) throw new Error('Missing application mount element.');
render(() => <PaintStudio />, element);
