import { Link, RouteDefinition, Routes, useRoutes } from 'solid-app-router';
import { lazy } from 'solid-js';

import s from './App.module.scss';

const routes: RouteDefinition[] = [
  {
    path: '/',
    component: lazy(() => import('./Main')),
  },
  {
    path: '/three',
    component: lazy(() => import('./Three')),
  },
  {
    path: '/three-pixi',
    component: lazy(() => import('./ThreePixi')),
  },
  {
    path: '/tanki',
    component: lazy(() => import('./Tanki/Tanki')),
  },
  {
    path: '/ecs',
    component: lazy(() => import('./TestEcs')),
  },
];

export function App() {
  const Routes = useRoutes(routes);

  return (
    <>
      <header class={s.header}>
        <Link href="/">Main</Link>
        <Link href="/three">Three</Link>
        <Link href="/three-pixi">ThreePixi</Link>
        <Link href="/tanki">Tanki</Link>
        <Link href="/ecs">ECS</Link>
      </header>
      <main>
        <Routes />
      </main>
    </>
  );
}
