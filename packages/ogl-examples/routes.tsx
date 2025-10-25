import { Navigation } from '@packages/app-router/components/navigation';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import polylinesThumbnail from './chrome_2023-11-18_15-48-40.png?url';
import skinningThumbnail from './chrome_2023-11-18_16-10-52.png?url';

const routes: Routes[] = [
  {
    path: '/polylines',
    name: 'OGL Polylines',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={polylinesThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/polylines'))
  },
  {
    path: '/skinning',
    name: 'OGL skinning',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={skinningThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/skinning/skinning'))
  },
  {
    path: '/msdf-text',
    name: 'OGL MSDF Text',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/msdf-text/msdf-text'))
  },
  {
    path: '/sort-transparency',
    name: 'OGL Sort Transparency',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/sort-transparency/sort-transparency'))
  },
  {
    path: '/helpers',
    name: 'OGL Helpers',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/helpers/helpers'))
  },
  {
    path: '/draw-modes',
    name: 'OGL Draw modes',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/draw-modes/draw-modes'))
  },
  {
    path: '/load-gltf',
    name: 'Load glTF',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/load-gltf/load-gltf'))
  },

  {
    path: '/ogl-flowmap',
    name: 'OGL Flowmap',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/flowmap/flowmap'))
  },
  {
    path: '/ogl-mouse-flowmap',
    name: 'OGL Mouse Flowmap',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/mouse-flowmap/mouse-flowmap'))
  },
  {
    path: '/ogl-raycasting',
    name: 'OGL Raycasting',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/raycasting/raycasting'))
  },
  {
    path: '/ogl-frustum',
    name: 'OGL Frustum',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/frustum/frustum'))
  },
  {
    path: '/ogl-mouse-flowmap',
    name: 'OGL Mouse Flowmap',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/mouse-flowmap/mouse-flowmap'))
  },
  {
    path: '/ogl-instancing',
    name: 'OGL Instancing',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ogl-examples/ogl-instancing/ogl-instancing'))
  }
];

export const oglRoutes: Routes = {
  path: '/ogl-examples',
  name: ' ',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">
        {/* <a href="https://github.com/oframe/ogl" target="_blank">
          </a> */}
        OGL
      </h2>
      <span class="text-center text-sm">It's like WebGL, but it is WebGL</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">🚄</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => (
        <>
          <div class="flex w-full place-content-center place-items-center bg-blue-100">OGL Examples</div>
          <Navigation routes={routes} parentPath="." />
        </>
      )
    },
    ...routes
  ]
};
