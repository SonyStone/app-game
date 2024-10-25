import { Thumbnail } from '@packages/ui-components/thumbnail';
import { Routes } from 'src/routes.interface';

import multitouchThumbnail from '@packages/hammer-examples/thumbnail.png';
import { lazy } from 'solid-js';
import texturesViewThumbnail from './thumbnail/chrome_2024-06-13_07-04-13.png?url';

export const routes: Routes[] = [
  {
    path: '/hammer-multitouch',
    name: 'Hammer Multitouch',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={multitouchThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/hammer-examples/multitouch'))
  },
  {
    path: '/brush-example',
    name: 'Brush Example',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={texturesViewThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/paint/brush-example/brush-example'))
  },
  {
    path: '/paint',
    name: 'Paint',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/paint-1/paint-page'))
  },
  {
    path: '/ogl-paint-full-screen',
    name: 'OGL paint full screen canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/paint-ogl-1/paint-2'))
  },
  {
    path: '/paint-app',
    name: 'paint app [WIP]',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/paint-app/paint-app'))
  },
  {
    path: '/lasso-select-example',
    name: 'Lasso Select Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/lasso-select-example/lasso-select-example'))
  },
  {
    path: '/offscreen-canvas-example',
    name: 'Offscreen Canvas Example [WIP]',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/offscreen-canvas-example/offscreen-canvas-example'))
  },
  {
    path: '/can-i-use',
    name: '"Can I Use"',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/can-i-use/can-i-use'))
  },
  {
    path: '/canvas-paint',
    name: 'Paint on WebGL Canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/canvas-paint/canvas-paint'))
  },
  {
    path: '/canvas-paint-step-by-step-1',
    name: 'Paint on WebGL Canvas Step by Step #1',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/canvas-paint/canvas-paint-step-by-step-1'))
  },
  {
    path: '/canvas-paint-step-by-step-2',
    name: 'Paint on WebGL Canvas Step by Step #2',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/canvas-paint/canvas-paint-step-by-step-2'))
  },
  {
    path: '/offscreen-canvas-paint',
    name: 'Paint on WebGL OffscreenCanvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/offscreen-canvas-paint/offscreen-canvas-paint'))
  },
  {
    path: '/ui-example',
    name: 'Paint UI Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/ui-example/ui-example'))
  },
  {
    path: '/trigonometry',
    name: 'Trigonometry Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/paint/ui-example/trigonometry'))
  }
];
