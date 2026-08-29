import { Navigation } from '@app-game/app-router';

import type { JSX } from '@solidjs/web';
import { createMemo, Loading } from 'solid-js';

export default function PaintPage(props: Partial<{ children: JSX.Element }>) {
  const module = createMemo(() => import('./routes'));

  return (
    <div class="mx-auto flex h-full max-w-screen-2xl flex-col gap-4 bg-gray-100 p-2">
      <div class="flex w-full place-content-center place-items-center gap-1 bg-blue-100">Paint App</div>

      <a href="/" class="place-self-start rounded bg-blue-100 px-1 text-2xl font-thin hover:bg-blue-300">
        Back
      </a>

      <p>To implement such app we need:</p>
      <Loading>
        <ol class="list-decimal ps-6">
          <li>
            <div class="flex flex-col gap-2">
              <span>WebGL wrapper - to simplify work with WebGL</span>
              <Navigation class="p-0 py-2" routes={module()?.rendererRoutes} parentPath="." />
            </div>
          </li>
          <li>
            <div class="flex flex-col gap-2">
              <span>Brush engine - to manage brushes, colors, sizes, and drawing logic</span>
              <Navigation class="p-0 py-2" routes={module()?.brushEngineRoutes} parentPath="." />
            </div>
          </li>
          <li>
            <div class="flex flex-col gap-2">
              <span>Pointer events - to handle user input from mouse, touch, and stylus</span>
              <Navigation class="p-0 py-2" routes={module()?.pointerEventsRoutes} parentPath="." />
            </div>
          </li>
          <li>
            <div class="flex flex-col gap-2">
              <span>Rest events - to handle actions like undo, redo, clear canvas, save image</span>
              <Navigation class="p-0 py-2" routes={module()?.restRoutes} parentPath="." />
            </div>
          </li>
        </ol>
      </Loading>

      <p>When implementing everything, we can combine them all together:</p>

      {props.children}
    </div>
  );
}
