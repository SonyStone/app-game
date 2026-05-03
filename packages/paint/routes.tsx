import { Thumbnail, type Routes } from '@app-game/app-router';
import multitouchThumbnail from '@packages/hammer-examples/thumbnail.png';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import texturesViewThumbnail from './thumbnail/chrome_2024-06-13_07-04-13.png?url';

export const rendererRoutes: Routes[] = [];

export const pointerEventsRoutes: Routes[] = [
  {
    path: '/hammer-multitouch',
    name: 'Hammer Multitouch',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={multitouchThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/hammer-examples/multitouch'))
  },
  {
    path: '/input-visualizer',
    name: 'Input Visualizer (Keyboard & Mouse)',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./input-visualizer/input-visualizer'))
  },
  {
    path: '/shortcut-settings',
    name: 'Shortcut Settings',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./input-visualizer/shortcut-settings'))
  }
];

export const brushEngineRoutes: Routes[] = [
  {
    path: '/brush-example',
    name: 'Brush Example',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={texturesViewThumbnail} name={props.name} />,
    component: lazy(() => import('./brush-example/brush-example'))
  },
  {
    path: '/paint',
    name: 'Paint',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./paint-1/paint-page'))
  }
];

export const restRoutes: Routes[] = [
  {
    path: '/ogl-paint-full-screen',
    name: 'OGL paint full screen canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./paint-ogl-1/paint-2'))
  },
  {
    path: '/paint-app',
    name: 'paint app [WIP]',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./paint-app/paint-app'))
  },
  {
    path: '/lasso-select-example',
    name: 'Lasso Select Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./lasso-select-example/lasso-select-example'))
  },
  {
    path: '/offscreen-canvas-support-check',
    name: 'Offscreen Canvas Support Check',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./offscreen-canvas-support-check'))
  },
  {
    path: '/can-i-use',
    name: '"Can I Use"',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./can-i-use/can-i-use'))
  },
  {
    path: '/canvas-paint',
    name: 'Paint on WebGL Canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./canvas-paint/canvas-paint'))
  },
  {
    path: '/canvas-paint-step-by-step-1',
    name: 'Paint on WebGL Canvas Step by Step #1',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./canvas-paint/canvas-paint-step-by-step-1'))
  },
  {
    path: '/canvas-paint-step-by-step-2',
    name: 'Paint on WebGL Canvas Step by Step #2',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./canvas-paint/canvas-paint-step-by-step-2'))
  },
  {
    path: '/offscreen-canvas-paint',
    name: 'Paint on WebGL OffscreenCanvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./offscreen-canvas-paint/offscreen-canvas-paint'))
  },
  {
    path: '/ui-example',
    name: 'Paint UI Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./ui-example/ui-example'))
  },
  {
    path: '/trigonometry',
    name: 'Trigonometry Example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./ui-example/trigonometry'))
  },
  {
    path: '/tile-based-canvas',
    name: 'Tile Based Canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./tile-based-canvas'))
  },
  {
    path: '/webgl-whiteboard',
    name: 'Webgl Whiteboard',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./webgl-whiteboard'))
  }
];

export const paintRoutes: Routes = {
  path: '/paint',
  Preview: (props) => (
    <A
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">Paint App</h2>
      <span class="text-center text-sm">Stuff associated with creating a drawing application</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">🎨</span>
      </div>
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: lazy(() => import('./index'))
    },
    ...brushEngineRoutes,
    ...restRoutes,
    ...pointerEventsRoutes
  ]
};
