import { createCookieStorage } from '@solid-primitives/storage';
import {
  delay,
  mapTo,
  merge,
  of,
  startWith,
  Subject,
  switchMap,
  takeUntil,
} from 'rxjs';
import { Link, RouteDefinition, Routes, useRoutes } from 'solid-app-router';
import { ErrorBoundary, For, from, lazy } from 'solid-js';

import s from './App.module.scss';
import Noise from './noise/Noise';
import { useStats } from './Stats.provider';
import { useCamera } from './three/Camera.provider';

const routes: (RouteDefinition & { name: string })[] = [
  {
    path: '/',
    name: 'isometric',
    component: lazy(() => import('./isometric/Isometric')),
  },
  {
    path: '/three-pixi',
    name: 'ThreePixi',
    component: lazy(() => import('./ThreePixi')),
  },
  {
    path: '/3d-rpg',
    name: '3D RPG',
    component: lazy(() => import('./3d-rpg/Main')),
  },
  {
    path: '/tanki',
    name: 'Tanki',
    component: lazy(() => import('./Tanki/Tanki')),
  },
  {
    path: '/wasm-game-of-life',
    name: 'Wasm Game Of Life',
    component: lazy(() => import('./WasmGameOfLife')),
  },
  {
    path: '/my-pixijs',
    name: 'My Pixijs',
    component: lazy(() => import('./my-pixijs/MyPixijs')),
  },
  {
    path: '/3d-wireframe',
    name: '3d Wireframe',
    component: lazy(() => import('./my-pixijs/webgl/3d-wireframe/3dWireframe')),
  },
  {
    path: '/webgl_postprocessing_smaa',
    name: 'webgl - postprocessing smaa',
    component: lazy(() => import('./three/PostprocessingSmaa')),
  },
  {
    path: '/webgl_loader_svg',
    name: 'webgl - svg loader',
    component: lazy(() => import('./three/SvgLoader')),
  },
  {
    path: '/sprites',
    name: 'Sprites',
    component: lazy(() => import('./three/Sprites')),
  },
  {
    path: '/three',
    name: 'Three',
    component: lazy(() => import('./three/Three')),
  },
  {
    path: '/solid-three',
    name: 'SolidThree',
    component: lazy(() => import('./three/Solid-Three')),
  },
  {
    path: '/paint',
    name: 'Paint',
    component: lazy(() => import('./paint/Paint')),
  },
  {
    path: '/twgl',
    name: 'twgl',
    component: lazy(() => import('./twgl/Main')),
  },
  {
    path: '/view-offset',
    name: 'ViewOffset',
    component: lazy(() => import('./three/ViewOffset')),
  },
  {
    path: '/game-ecs',
    name: 'Game ECS',
    component: lazy(() => import('./game-ecs/Index')),
  },
  {
    path: '/gpu-text-rendering',
    name: 'GPU Text Rendering',
    component: lazy(() => import('./gpu-text-rendering/Index')),
  },
  {
    path: '/geometric-algebra',
    name: 'Geometric Algebra',
    component: lazy(() => import('./geometric-algebra/GeometricAlgebra')),
  },
  {
    path: '/player',
    name: 'Player',
    component: lazy(() => import('./player/App')),
  },
  {
    path: '/animations',
    name: 'Animations',
    component: lazy(() => import('./libs/gsap/Animations')),
  },
  {
    path: '/phaser-game',
    name: 'Phaser Game',
    component: lazy(() => import('./phaser/Game')),
  },
  {
    path: '/:any',
    name: 'Empty',
    component: () => <div class={s.nothing}>Nothing is here</div>,
  },
];

function toggleSidenav() {
  const onLeave$ = new Subject<void>();
  const onEnter$ = new Subject<void>();
  const onClose$ = new Subject<void>();
  const onOpen$ = new Subject<void>();

  const isOpen = from(
    merge(
      onOpen$.pipe(mapTo(true)),
      onClose$.pipe(mapTo(false)),
      onEnter$.pipe(mapTo(true)),
      onLeave$.pipe(
        switchMap((e) => of(e).pipe(delay(1000), takeUntil(onEnter$))),
        mapTo(false)
      )
    ).pipe(startWith(false))
  );

  return {
    isOpen,
    toggle() {
      isOpen() ? onClose$.next() : onOpen$.next();
    },
    open() {
      onOpen$.next();
    },
    close() {
      onClose$.next();
    },
    leave() {
      onLeave$.next();
    },
    enter() {
      onEnter$.next();
    },
  };
}

export function App() {
  const Routes = useRoutes(routes);
  const stats = useStats();

  const { toggleCamera, cameraType } = useCamera();

  const { isOpen, toggle } = toggleSidenav();

  stats.showPanel(1);
  stats.dom.style.left = 'unset';
  stats.dom.style.right = '0';

  interface UserCreadential {
    uid: string;
    token: string;
  }
  const [storage, setStorage, { remove, clear }] =
    createCookieStorage<string>();
  const uid = storage.uid;

  return (
    <>
      <header class={[s.header, s.right].join(' ')}>
        <button class={s.toggle} onClick={toggle}>
          ⇶
        </button>
        <nav class={[s.navigation, isOpen() ? s.open : ''].join(' ')}>
          <For each={routes}>
            {({ path, name }) => <Link href={path}>{name}</Link>}
          </For>
          <button onClick={toggleCamera}>{cameraType}</button>
        </nav>
      </header>
      {stats.dom}
      <main>
        <ErrorBoundary
          fallback={(error) => {
            console.error(error);
            return <div>Error in the App</div>;
          }}>
          <Routes />
        </ErrorBoundary>
      </main>
      <Noise />
    </>
  );
}
