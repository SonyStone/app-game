import { Thumbnail, type Routes } from '@app-game/app-router';
import { lazy } from 'solid-js';

const gameRoutes = [
  {
    path: '/',
    name: 'Start',
    component: lazy(() => import('./StartMenuScene'))
  },
  {
    path: '/play',
    name: 'Play',
    component: lazy(() => import('./PlaySceneRoute'))
  }
] satisfies Routes[];

export const nightDefenseRoutes = {
  path: '/night-defense',
  name: 'Night Defense',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./App')),
  children: gameRoutes
} satisfies Routes;

export const standaloneNightDefenseRoutes = {
  path: '/',
  component: lazy(() => import('./App')),
  children: gameRoutes
} satisfies Routes;
