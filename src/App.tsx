import { Link, RouteDefinition, Routes, useRoutes } from 'solid-app-router';
import { For, lazy } from 'solid-js';

import s from './App.module.scss';
import { useStats } from './Stats.provider';
import { CameraProvider } from './three/Camera.provider';
import { withProviders } from './utils/withProviders';

const routes: (RouteDefinition & { name: string })[] = [
  {
    path: '/',
    name: 'Main',
    component: lazy(() => import('./Main')),
  },
  {
    path: '/empty',
    name: 'Empty',
    component: () => (
      <>
        <br />
        Nothing is here
      </>
    ),
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
    path: '/ecs',
    name: 'ECS',
    component: lazy(() => import('./TestEcs')),
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
];

export function App() {
  const Routes = useRoutes(routes);
  const stats = useStats();

  stats.showPanel(1);
  stats.dom.style.left = 'unset';
  stats.dom.style.right = '0';

  return (
    <>
      <header class={s.header}>
        <For each={routes}>
          {({ path, name }) => <Link href={path}>{name}</Link>}
        </For>
      </header>
      {stats.dom}
      <main>
        <Routes />
      </main>
    </>
  );
}