import { Thumbnail, type Routes } from '@app-game/app-router';
import { bookmarksExplorerRoutes } from '@app-game/bookmarks-explorer/routes';
import { escyRoutes } from '@app-game/ecsy-pages/routes';
import { filmAnnotationPlayerRoutes } from '@app-game/film-annotation-player/routes';
import { gsapExamplesRoutes } from '@app-game/gsap-examples/routes';
import { mathRoutes } from '@app-game/math-examples/routes';
import { oglRoutes } from '@app-game/ogl-examples/routes';
import { paintRoutes } from '@app-game/paint/routes';
import { phaserRoutes } from '@app-game/phaser-examples/routes';
import { pixijsRoutes } from '@app-game/pixijs-examples/routes';
import { routes as greasePencilTypegpuRoutes } from '@app-game/grease-pencil-typegpu/routes';
import { routes as solidDndPlaygroundRoutes } from '@app-game/solid-dnd-playground/routes';
import { routes as solidSvgEditorRoutes } from '@app-game/solid-svg-editor/routes';
import { routes as solidjsPatternsRoutes } from '@app-game/solidjs-patterns/routes';
import { threeRoutes } from '@app-game/three-examples';
import { twglRoutes } from '@app-game/twgl-examples/routes';
import { typegpuRoutes } from '@app-game/typegpu-examples/routes';
import { uiComponentsRoutes } from '@app-game/ui-components-examples/routes';
import { wasmRustRoutes } from '@app-game/wasm-rust-pages/routes';
import { webglExamplesRoute } from '@app-game/webgl-examples/routes';
import { webgpuRoutes } from '@app-game/webgpu-examples/routes';
import { lazy } from 'solid-js';
import HomePage from './home-page';
import wireframeThumbnail from './thumbnail/wireframe-thumbnail.png?url';

export const routes: Routes[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage
  },
  {
    path: '/solid-dnd',
    name: 'Solid DnD Playground',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    children: [solidDndPlaygroundRoutes]
  },
  {
    path: '/solidjs-patterns',
    name: 'SolidJS Patterns',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    children: [solidjsPatternsRoutes]
  },
  {
    path: '/grease-pencil-typegpu',
    name: 'Grease Pencil TypeGPU',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    children: [greasePencilTypegpuRoutes]
  },
  {
    path: '/solid-svg-editor',
    name: 'Solid SVG Editor',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    children: [solidSvgEditorRoutes]
  },
  {
    path: '/dnd-playground',
    name: 'DnD Playground',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/dnd-playground/App'))
  },
  wasmRustRoutes,
  mathRoutes,
  filmAnnotationPlayerRoutes,
  uiComponentsRoutes,
  gsapExamplesRoutes,
  {
    path: '/web-audio',
    name: 'Web Audio API',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/web-audio/web-audio-page'))
  },
  paintRoutes,
  webglExamplesRoute,
  webgpuRoutes,
  typegpuRoutes,
  oglRoutes,
  threeRoutes,
  twglRoutes,
  phaserRoutes,
  pixijsRoutes,
  escyRoutes,
  bookmarksExplorerRoutes,
  {
    path: '/wip',
    Preview: () => (
      <div class="rounded-2 flex flex-col place-content-center place-items-center border-e-15 border-slate-200 p-2">
        <h2 class="text-4xl">WIP</h2>
        <span class="text-center">And generally not interesting stuff</span>
      </div>
    )
  },
  {
    path: '/tanki',
    name: 'Tanki',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/tanki'))
  },
  {
    path: '/3d-wireframe',
    name: '3d Wireframe',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={wireframeThumbnail} name={props.name} />,
    component: lazy(() => import('@app-game/pixijs-research/webgl/3d-wireframe/3dWireframe'))
  },
  // !not working
  // {
  //   path: '/my-pixijs',
  //   name: 'My Pixijs',
  //   component: lazy(() => import('@app-game/pixijs-research/MyPixijs'))
  // },
  {
    path: '/excalibur-examples',
    name: 'Excalibur.js Examples',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/excalibur-examples'))
  },
  {
    path: '/babylon',
    name: 'Babylon.js',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/babylonjs-examples/babylon-example'))
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
    component: lazy(() => import('@app-game/gsap/Animations'))
  },
  {
    path: '/ldtk-ts-exampless',
    name: 'ldtk-ts example',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/ldtk-ts-examples/example'))
  },
  {
    path: '/game-shaders-for-beginners',
    name: '[WIP] Game Shaders For Beginners',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/game-shaders-for-beginners/game-shaders-for-beginners'))
  },
  {
    path: '/webxr-vr-teleport',
    name: 'WebXR VR Teleport',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/three-examples/webxr-vr-teleport/webxr-vr-teleport'))
  },
  {
    path: '/webgl-state-diagram',
    name: '[WIP] WebGL State Diagram',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/webgl-state-diagram/webgl-state-diagram'))
  },
  {
    path: '/gsap-page-scroll-animation',
    name: 'Page Scroll Animation',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/gsap-examples/page-scroll-animation/page-scroll-animation'))
  },
  {
    path: '/piecs-performance',
    name: 'piecs performance',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/piecs-examles/performance/performance'))
  },
  {
    path: '/litegraph',
    name: '[WIP] litegraph',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/litegraph-examples/litegraph'))
  },
  {
    path: '/litegraph/first-project',
    name: 'litegraph First project',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/litegraph-examples/first-project/first-project'))
  },
  {
    path: '/svg-editor',
    name: '[WIP] SVG Editor',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/svg-editor'))
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
