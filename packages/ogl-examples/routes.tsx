import { Thumbnail } from '@packages/ui-components/thumbnail';

import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';
import polylinesThumbnail from './chrome_2023-11-18_15-48-40.png?url';
import skinningThumbnail from './chrome_2023-11-18_16-10-52.png?url';

export const routes: Routes[] = [
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
