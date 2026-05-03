import { Thumbnail, type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { For, lazy } from 'solid-js';
import instancingWithUBOandVAOThumbnail from './instancing-with-ubo-and-vao/image.png?url';
import tiledMaphumbnail from './tiled-map/image.png?url';

export const routes = [
  (() => {
    const path = '/simple-program';
    const name = 'Simple Program (nothing to see)';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('./simple-program/simple-program'))
    };
  })(),
  (() => {
    const path = '/matrices-2d';
    const name = '2d matrices';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('./matrices-2d/matrices-2d'))
    };
  })(),
  (() => {
    const path = '/meshing';
    const name = 'Meshing [WIP]';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('./ogl-meshing/meshing'))
    };
  })(),
  (() => {
    const path = '/instanced-drawing';
    const name = 'Instanced Drawing';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('./instanced-drawing/instanced-drawing'))
    };
  })(),
  (() => {
    const path = '/blending-modes';
    const name = 'Blending Modes';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('./ogl-blending-modes/ogl-blending-modes'))
    };
  })(),
  (() => {
    const path = '/instancing-with-ubo-and-vao';
    const name = 'Instancing With UBO and VAO';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} thumbnail={instancingWithUBOandVAOThumbnail} />,
      component: lazy(() => import('./instancing-with-ubo-and-vao/instancing-with-ubo-and-vao'))
    };
  })(),
  (() => {
    const path = '/tiled-map';
    const name = 'Tiled Map or Chunk-Based Rendering';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} thumbnail={tiledMaphumbnail} />,
      component: lazy(() => import('./tiled-map/tiled-map'))
    };
  })(),
  (() => {
    const path = '/model-viewer';
    const name = '[WIP] Model Viewer';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('./ogl-model-viewer/model-viewer'))
    };
  })()
] as const;

export const webglExamplesRoute: Routes = {
  path: '/webgl-examples',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">
        {/* <a href="https://webgl2fundamentals.org/" target="_blank">
        </a> */}
        WebGL
      </h2>
      <span class="text-center text-sm">Examples, they may work, or may not. Who knows?</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">🙂</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">WebGL Examples</div>
          <div class="grid grid-cols-[repeat(auto-fill,_minmax(12rem,_1fr))] gap-4 p-4">
            <For each={routes}>{({ Preview }) => <Preview />}</For>
          </div>
        </>
      )
    },
    ...routes
  ]
};
