import { createFolderHistoryMorph, FolderHost, TilePreviews } from '@app-game/app-router';
import { createRouter } from '@solidjs/router';
import { Loading } from 'solid-js';

import HomePage from './home/home-page';
import { routes } from './routes';

const Router = createRouter({ routes });

/** Screenshots of pages by their path: `previews/pages/typegpu-examples/3-webgpu-uniforms.webp` is `/typegpu-examples/3-webgpu-uniforms`. */
const pagePreviews = import.meta.glob<string>('./previews/pages/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
});

function previewOf(path: string) {
  return pagePreviews[`./previews/pages${path.replace(/\/$/, '')}.webp`];
}

export function App() {
  createFolderHistoryMorph();

  return (
    <TilePreviews value={previewOf}>
      <FolderHost value={HomePage}>
        <Loading fallback={<div class="grid min-h-screen place-items-center">Loading…</div>}>
          <Router />
        </Loading>
      </FolderHost>
    </TilePreviews>
  );
}
