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
import { Thumbnail } from '@packages/ui-components/thumbnail';
import { routes as webglRoutes } from '@packages/webgl-examples/routes';
import { routes as webgpuRoutes } from '@packages/webgpu-examples/routes';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import Navigation from './navigation';
import { Routes } from './routes.interface';
import gameOfLifeThumbnail from './thumbnail/chrome_2023-11-18_15-20-36.png?url';
import twglThumbnail from './thumbnail/chrome_2023-11-18_15-44-48.png?url';
import wireframeThumbnail from './thumbnail/wireframe-thumbnail.png?url';
import worldBodiesThumbnail from './thumbnail/world-rodies-thumbnail.png?url';

const SectionTitle = (props: { name: string }) => (
  <div class="rounded-2 border-e-15 flex aspect-square w-full place-content-center place-items-center border-slate-200 p-2">
    <h2 class="text-4xl">{props.name}</h2>
  </div>
);

export const routes: Routes[] = [
  {
    path: '/',
    name: 'home',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./home-page'))
  },
  {
    path: '/wasm-game-of-life',
    name: 'Game Of Life',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={gameOfLifeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/wasm-rust-examples/wasm-game-of-life'))
  },
  {
    path: '/math',
    name: 'Math Examples',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/math-examples/math-examples')),
    children: [
      {
        path: '/',
        component: () => <Navigation routes={mathRoutes} parentPath="." />
      },
      ...mathRoutes
    ]
  },
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
  {
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
        component: () => (
          <>
            <div class="flex w-full place-content-center place-items-center bg-blue-100">Paint App</div>
            <Navigation routes={paintRoutes} parentPath="." />
          </>
        )
      },
      ...paintRoutes
    ]
  },
  {
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
            <div class="flex w-full place-content-center place-items-center bg-blue-100">WebGPU Examples</div>
            <Navigation routes={webglRoutes} parentPath="." />
          </>
        )
      },
      ...webglRoutes
    ]
  },
  {
    path: '/webgpu-examples',
    name: 'WebGPU',
    Preview: (props) => (
      <A
        class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 p-2 px-4"
        href={props.path}
      >
        <h2 class="text-4xl">
          {/* <a href="https://webgl2fundamentals.org/" target="_blank">
              </a> */}
          WebGPU
        </h2>
        <span class="text-center text-sm">Is it here or not?</span>
        <div class="absolute -end-2 bottom-1">
          <span class="text-4rem leading-6">😐</span>
        </div>
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => (
          <>
            <div class="flex w-full place-content-center place-items-center bg-blue-100">WebGPU Examples</div>
            <Navigation routes={webgpuRoutes} parentPath="." />
          </>
        )
      },
      ...webgpuRoutes
    ]
  },
  {
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
            <Navigation routes={oglRoutes} parentPath="." />
          </>
        )
      },
      ...oglRoutes
    ]
  },
  {
    path: '/three-examples',
    name: 'Three js Examples',
    Preview: (props) => (
      <A href={props.path} class="rounded-2 relative">
        <SectionTitle name={props.name} />
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => (
          <>
            <div class="flex w-full place-content-center place-items-center bg-blue-100">Three js Examples</div>
            <Navigation routes={threeRoutes} parentPath="." />
          </>
        )
      },
      ...threeRoutes
    ]
  },
  {
    path: '/twgl-examples',
    name: 'twgl Examples',
    Preview: (props) => (
      <A href={props.path} class="rounded-2 relative">
        <SectionTitle name={props.name} />
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => <Navigation routes={twglRoutes} parentPath="." />
      },
      ...twglRoutes
    ]
  },
  {
    path: '/phaser-examples',
    name: 'Phaser Examples',
    Preview: (props) => (
      <A href={props.path} class="rounded-2 relative">
        <SectionTitle name={props.name} />
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => <Navigation routes={phaserRoutes} parentPath="." />
      },
      ...phaserRoutes
    ]
  },
  {
    path: '/pixijs-examples',
    name: 'PixiJS Examples',
    Preview: (props) => (
      <A href={props.path} class="rounded-2 relative">
        <SectionTitle name={props.name} />
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => <Navigation routes={pixijsRoutes} parentPath="." />
      },
      ...pixijsRoutes
    ]
  },
  {
    path: '/ecsy-examples',
    name: 'ECSY Examples',
    Preview: (props) => (
      <A href={props.path} class="rounded-2 relative">
        <SectionTitle name={props.name} />
        <Ripple class="text-slate/20" />
      </A>
    ),
    children: [
      {
        path: '/',
        component: () => <Navigation routes={escyRoutes} parentPath="." />
      },
      ...escyRoutes
    ]
  },
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
    component: lazy(() => import('@packages/tanki/tanki'))
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
    path: '/babylon',
    name: 'Babylon.js',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/babylonjs-examples/babylon-example'))
  },
  {
    path: '/twgl',
    name: 'twgl',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={twglThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/Main'))
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
    path: '/model-biewer',
    name: '[WIP] Model Viewer',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/webgl-examples/ogl-model-viewer/model-viewer'))
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
