import { Navigation } from '@packages/app-router/components/navigation';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { routes as escyRoutes } from '@packages/ecsy-examples/routes';
import { routes as mathRoutes } from '@packages/math-examples/routes';
import { routes as oglRoutes } from '@packages/ogl-examples/routes';
import { routes as paintRoutes } from '@packages/paint/routes';
import { routes as phaserRoutes } from '@packages/phaser-examples/routes';
import { routes as pixijsRoutes } from '@packages/pixijs-examples/routes';
import { routes as threeRoutes } from '@packages/three-examples/router';
import { routes as twglRoutes } from '@packages/twgl-examples/routes';
import { routes as uiComponentsRoutes } from '@packages/ui-components-examples/routes';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { routes as wasmRustRoutes } from '@packages/wasm-rust-examples/routes';
import { webglExamplesRoute } from '@packages/webgl-examples/routes';
import { routes as webgpuRoutes } from '@packages/webgpu-examples/routes';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import wireframeThumbnail from './thumbnail/wireframe-thumbnail.png?url';
import worldBodiesThumbnail from './thumbnail/world-rodies-thumbnail.png?url';

export const routes: Routes[] = [
  {
    path: '/',
    name: 'home',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./home-page'))
  },
  wasmRustRoutes,
  mathRoutes,
  {
    path: '/player',
    name: 'Player',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/film-annotation-player/App'))
  },
  {
    path: '/100-world-bodies',
    name: '100 world bodies',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={worldBodiesThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/physics/matterjs/100 world bodies'))
  },
  {
    path: '/ui-components-examples',
    Preview: (props) => (
      <A
        class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden overflow-hidden bg-slate-200 p-2 p-2 px-4"
        href={props.path}
      >
        <h2 class="text-4xl">UI/UX</h2>
        <span class="text-center text-sm">Stuff associated with creating a UI</span>
        <div class="absolute -end-2 bottom-1">
          <span class="text-4rem leading-6">🖼️</span>
        </div>
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => (
          <>
            <div class="flex w-full place-content-center place-items-center bg-blue-100">UI Components</div>
            <Navigation routes={uiComponentsRoutes} parentPath="." />
          </>
        )
      },
      ...uiComponentsRoutes
    ]
  },
  {
    path: '/gsap-scroll-trigger-svg-text-mask',
    name: 'ScrollTrigger: SVG Text Mask',
    Preview: (props) => (
      <A
        class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden overflow-hidden bg-slate-200 p-2 p-2 px-4"
        href={props.path}
      >
        <h2 class="text-4xl">GSAP</h2>
        <span class="text-center text-sm">{props.name}</span>
        <div class="absolute -end-2 bottom-1">
          <span class="text-4rem leading-6">💫</span>
        </div>
        <Ripple class="text-slate/20" />
      </A>
    ),
    component: lazy(() => import('@packages/gsap-examples/scroll-trigger-svg-text-mask/scroll-trigger-svg-text-mask'))
  },
  {
    path: '/web-audio',
    name: 'Web Audio API',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/web-audio/web-audio-page'))
  },
  paintRoutes,
  webglExamplesRoute,
  webgpuRoutes,
  oglRoutes,
  threeRoutes,
  twglRoutes,
  phaserRoutes,
  pixijsRoutes,
  escyRoutes,
  {
    path: '/wip',
    Preview: () => (
      <div class="rounded-2 border-e-15 flex flex-col place-content-center place-items-center border-slate-200 p-2">
        <h2 class="text-4xl">WIP</h2>
        <span class="text-center">And generally not interesting stuff</span>
      </div>
    )
  },
  {
    path: '/tanki',
    name: 'Tanki',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/tanki'))
  },
  {
    path: '/3d-wireframe',
    name: '3d Wireframe',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={wireframeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/pixijs-research/webgl/3d-wireframe/3dWireframe'))
  },
  // !not working
  // {
  //   path: '/my-pixijs',
  //   name: 'My Pixijs',
  //   component: lazy(() => import('@packages/pixijs-research/MyPixijs'))
  // },
  {
    path: '/excalibur-examples',
    name: 'Excalibur.js Examples',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/excalibur-examples'))
  },
  {
    path: '/babylon',
    name: 'Babylon.js',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/babylonjs-examples/babylon-example'))
  },
  {
    path: '/game-ecs',
    name: 'Game ECS',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./game-ecs/index'))
  },
  {
    path: '/gpu-text-rendering',
    name: 'GPU Text Rendering',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./gpu-text-rendering'))
  },
  {
    path: '/animations',
    name: 'Animations',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/gsap/Animations'))
  },
  {
    path: '/ldtk-ts-exampless',
    name: 'ldtk-ts example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/ldtk-ts-examples/example'))
  },
  {
    path: '/game-shaders-for-beginners',
    name: '[WIP] Game Shaders For Beginners',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/game-shaders-for-beginners/game-shaders-for-beginners'))
  },
  {
    path: '/webxr-vr-teleport',
    name: 'WebXR VR Teleport',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/three-examples/webxr-vr-teleport/webxr-vr-teleport'))
  },
  {
    path: '/webgl-state-diagram',
    name: '[WIP] WebGL State Diagram',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/webgl-state-diagram/webgl-state-diagram'))
  },
  {
    path: '/gsap-page-scroll-animation',
    name: 'Page Scroll Animation',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/gsap-examples/page-scroll-animation/page-scroll-animation'))
  },
  {
    path: '/piecs-performance',
    name: 'piecs performance',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/piecs-examles/performance/performance'))
  },
  {
    path: '/litegraph',
    name: '[WIP] litegraph',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/litegraph-examples/litegraph'))
  },
  {
    path: '/litegraph/first-project',
    name: 'litegraph First project',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/litegraph-examples/first-project/first-project'))
  },
  {
    path: '/model-viewer',
    name: '[WIP] Model Viewer',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/webgl-examples/ogl-model-viewer/model-viewer'))
  },
  {
    path: '/svg-editor',
    name: '[WIP] SVG Editor',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/svg-editor'))
  },
  {
    path: '/:any',
    name: 'Empty',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: () => (
      <div class="flex h-screen w-screen place-content-center place-items-center text-4xl">Nothing is here</div>
    )
  }
];
