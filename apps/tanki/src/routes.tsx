import { FolderIndex, Thumbnail, type Routes } from '@app-game/app-router';
import type { JSX } from '@solidjs/web';
import { lazy, Loading } from 'solid-js';

/** Tanki's pages, the match first; each fills the window on its own (see `framed`). */
const tankiPages = [
  {
    path: '/koth',
    name: 'King of the hill',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: framed(() => import('./koth/KothRoute'))
  },
  {
    path: '/spy',
    name: 'Spy sandbox',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: framed(() => import('./spy/SpyRoute'))
  },
  {
    path: '/arena',
    name: 'Arena',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: framed(() => import('./arena/ArenaRoute'))
  },
  {
    path: '/damage',
    name: 'Damage range',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: framed(() => import('./damage/DamageRoute'))
  },
  {
    path: '/editor',
    name: 'Map editor',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: framed(() => import('./editor/EditorRoute'))
  },
  {
    path: '/tilt',
    name: 'Tilt sandbox',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: framed(() => import('./tilt/TiltSandbox'))
  }
] satisfies Routes[];

/** Tanki inside the examples hub at `/tanki`: a folder of its pages, which the hub's start page opens in place at `/tanki`. */
export const tankiRoutes = {
  path: '/tanki',
  name: 'Tanki',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  children: [{ path: '/', component: FolderIndex }, ...tankiPages]
} satisfies Routes;

/** Tanki as its own site, served from the root, which shows the arena as it always has. */
export const standaloneTankiRoutes = {
  path: '/',
  children: [{ path: '/', component: framed(() => import('./arena/ArenaRoute')) }, ...tankiPages]
} satisfies Routes;

/** A page loaded on demand inside the full-window frame every Tanki page shares, which stays empty while the page's code loads. */
function framed(load: Parameters<typeof lazy>[0]) {
  const Page = lazy(load);
  return () => (
    <TankiLayout>
      <Page />
    </TankiLayout>
  );
}

function TankiLayout(props: { children?: JSX.Element }) {
  return (
    <main class="app-utilities fixed inset-0 overflow-hidden bg-[#4d4d4d]">
      <Loading fallback={null}>{props.children}</Loading>
    </main>
  );
}
