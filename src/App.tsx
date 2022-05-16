import { Link, RouteDefinition, Routes, useRoutes } from 'solid-app-router';
import { createSignal, For, lazy } from 'solid-js';

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
    path: '/three',
    name: 'Three',
    component: lazy(() => import('./Three')),
  },
  {
    path: '/three-pixi',
    name: 'ThreePixi',
    component: lazy(() => import('./ThreePixi')),
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
    path: '/:any',
    name: 'Empty',
    component: () => <div class={s.nothing}>Nothing is here</div>,
  },
];

export function App() {
  const Routes = useRoutes(routes);
  const stats = useStats();

  const { toggleCamera, cameraType } = useCamera();

  const [isOpen, setOpen] = createSignal(false);

  stats.showPanel(1);
  stats.dom.style.left = 'unset';
  stats.dom.style.right = '0';

  return (
    <>
      <header class={[s.header, s.right].join(' ')}>
        <button
          class={s.toggle}
          onClick={(e) => {
            setOpen(!isOpen());
          }}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'touch') {
              setOpen(true);
            }
          }}>
          ⇶
        </button>
        <nav
          class={[s.navigation, isOpen() ? s.open : ''].join(' ')}
          onPointerLeave={() => setOpen(false)}>
          <For each={routes}>
            {({ path, name }) => <Link href={path}>{name}</Link>}
          </For>
          <button onClick={toggleCamera}>{cameraType}</button>
        </nav>
      </header>
      {stats.dom}
      <main>
        <Routes />
      </main>
      <Noise />
    </>
  );
}
