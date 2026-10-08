import { render } from '@solidjs/web';
import { PuckGallery } from './PuckGallery';

/** Dev-only entry at /puck-gallery.html: Puck-and-cluster design variants to try by hand, outside the production build. */
const element = document.getElementById('app');
if (!element) {
  throw new Error('Missing application mount element.');
}

render(() => <PuckGallery />, element);
