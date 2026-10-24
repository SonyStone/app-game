import { Thumbnail, type Routes } from '@app-game/app-router';
import type { JSX } from '@solidjs/web';
import { lazy, Loading } from 'solid-js';

const tankiPages = [
  {
    path: '/',
    name: 'Arena',
    component: lazy(() => import('./arena/ArenaRoute'))
  },
  {
    path: '/damage',
    name: 'Damage range',
    component: lazy(() => import('./damage/DamageRoute'))
  },
  {
    path: '/koth',
    name: 'King of the hill',
    component: lazy(() => import('./koth/KothRoute'))
  },
  {
    path: '/editor',
    name: 'Map editor',
    component: lazy(() => import('./editor/EditorRoute'))
  },
  {
    path: '/tilt',
    name: 'Tilt sandbox',
    component: lazy(() => import('./tilt/TiltSandbox'))
  }
] satisfies Routes[];

/** Tanki inside the examples hub at `/tanki`. */
export const tankiRoutes = {
  path: '/tanki',
  name: 'Tanki',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: TankiLayout,
  children: tankiPages
} satisfies Routes;

/** Tanki as its own site, served from the root. */
export const standaloneTankiRoutes = {
  path: '/',
  component: TankiLayout,
  children: tankiPages
} satisfies Routes;

/** Full-window frame shared by every Tanki page; it stays empty while a page's code loads. */
function TankiLayout(props: { children?: JSX.Element }) {
  return (
    <main class="app-utilities fixed inset-0 overflow-hidden bg-[#4d4d4d]">
      <Loading fallback={null}>{props.children}</Loading>
    </main>
  );
}
