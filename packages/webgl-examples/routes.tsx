import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { Thumbnail } from '@packages/ui-components/thumbnail';
import { Routes } from '@packages/utils/routes.interface';
import { A } from '@solidjs/router';
import { For, lazy } from 'solid-js';
import instancingWithUBOandVAOThumbnail from './instancing-with-ubo-and-vao/image.png?url';

export const routes = [
  (() => {
    const path = '/simple-program';
    const name = 'Simple Program (nothing to see)';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('@packages/webgl-examples/simple-program/simple-program'))
    };
  })(),
  (() => {
    const path = '/matrices-2d';
    const name = '2d matrices';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('@packages/webgl-examples/matrices-2d/matrices-2d'))
    };
  })(),
  (() => {
    const path = '/meshing';
    const name = 'Meshing [WIP]';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('@packages/webgl-examples/ogl-meshing/meshing'))
    };
  })(),
  (() => {
    const path = '/instanced-drawing';
    const name = 'Instanced Drawing';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('@packages/webgl-examples/instanced-drawing/instanced-drawing'))
    };
  })(),
  (() => {
    const path = '/blending-modes';
    const name = 'Blending Modes';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} />,
      component: lazy(() => import('@packages/webgl-examples/ogl-blending-modes/ogl-blending-modes'))
    };
  })(),
  (() => {
    const path = '/instancing-with-ubo-and-vao';
    const name = 'Instancing With UBO and VAO';
    return {
      path,
      name,
      Preview: () => <Thumbnail href={'.' + path} name={name} thumbnail={instancingWithUBOandVAOThumbnail} />,
      component: lazy(() => import('@packages/webgl-examples/instancing-with-ubo-and-vao/instancing-with-ubo-and-vao'))
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
