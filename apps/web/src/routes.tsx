import { abrViewerRoutes } from '@app-game/abr-viewer/routes';
import { Thumbnail, type Routes } from '@app-game/app-router';
import { browserAtlasRoutes } from '@app-game/browser-atlas/routes';
import { escyRoutes } from '@app-game/ecsy-pages/routes';
import { filmAnnotationPlayerRoutes } from '@app-game/film-annotation-player/routes';
import { cardStackRoutes, notebookRoute } from '@app-game/folder-tabs/routes';
import { routes as greasePencilTypegpuRoutes } from '@app-game/grease-pencil-typegpu/routes';
import { gsapExamplesRoutes } from '@app-game/gsap-examples/routes';
import { mathRoutes } from '@app-game/math-examples/routes';
import { nightDefenseRoutes } from '@app-game/night-defense/routes';
import { tankiRoutes } from '@app-game/tanki/routes';
import { oglRoutes } from '@app-game/ogl-examples/routes';
import { paintRoutes } from '@app-game/paint-examples/routes';
import { phaserRoutes } from '@app-game/phaser-examples/routes';
import { pixijsRoutes } from '@app-game/pixijs-examples/routes';
import { psdViewerRoutes } from '@app-game/psd-viewer/routes';
import { routes as solidDndPlaygroundRoutes } from '@app-game/solid-dnd-playground/routes';
import { routes as solidSvgEditorRoutes } from '@app-game/solid-svg-editor/routes';
import { solidVirtualRoutes } from '@app-game/solid-virtual/routes';
import { routes as solidjsPatternsRoutes } from '@app-game/solidjs-patterns/routes';
import { threeRoutes } from '@app-game/three-examples';
import { twglRoutes } from '@app-game/twgl-examples/routes';
import { typegpuRoutes } from '@app-game/typegpu-examples/routes';
import { uiComponentsRoutes } from '@app-game/ui-components-examples/routes';
import { wasmRustRoutes } from '@app-game/wasm-rust-pages/routes';
import { webglExamplesRoute } from '@app-game/webgl-examples/routes';
import { webgpuRoutes } from '@app-game/webgpu-examples/routes';
import { useNavigate } from '@solidjs/router';
import { lazy, onSettled } from 'solid-js';
import HomePage from './home/home-page';
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
    path: '/sortable-overlay',
    component: SortableOverlayRedirect
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
  cardStackRoutes,
  notebookRoute,
  abrViewerRoutes,
  psdViewerRoutes,
  nightDefenseRoutes,
  {
    path: '/dnd-playground',
    name: 'DnD Playground',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/dnd-playground/App'))
  },
  wasmRustRoutes,
  mathRoutes,
  filmAnnotationPlayerRoutes,
  solidVirtualRoutes,
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
  browserAtlasRoutes,
  tankiRoutes,
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
    path: '/gpu-text-rendering',
    name: 'GPU Text Rendering',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/gpu-text-rendering'))
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
    path: '/webxr-vr-teleport',
    name: 'WebXR VR Teleport',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/three-examples/webxr-vr-teleport/webxr-vr-teleport'))
  },
  {
    path: '/webgl-state-diagram',
    name: 'WebGL State Diagram',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/webgl-state-diagram/webgl-state-diagram'))
  },
  {
    path: '/spector',
    name: 'Spector Frame Inspector',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/spector'))
  },
  {
    path: '/gsap-page-scroll-animation',
    name: 'Page Scroll Animation',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@app-game/gsap-examples/page-scroll-animation/page-scroll-animation'))
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

function SortableOverlayRedirect() {
  const navigate = useNavigate();
  onSettled(() => {
    queueMicrotask(() => navigate('/solid-dnd/sortable-overlay', { replace: true }));
  });
  return null;
}
