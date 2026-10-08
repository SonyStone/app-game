import { render } from '@solidjs/web';
import { TileClusterMockup } from './TileClusterMockup';

/** Dev-only entry at /mockup.html: a working mockup of the tile cluster UI, outside the production build. */
const element = document.getElementById('app');
if (!element) {
  throw new Error('Missing application mount element.');
}

render(() => <TileClusterMockup />, element);
