import { Navigation, SectionTitle, Thumbnail, type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';

const routes: Routes[] = [
  {
    path: '/circles-boxes',
    name: 'Circles Boxes',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./circles-boxes/circles-boxes'))
  },
  {
    path: '/circles-boxes-dom',
    name: 'Circles Boxes DOM',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./circles-boxes-dom/circles-boxes-dom'))
  },
  {
    path: '/circles-boxes-pixijs',
    name: 'Circles Boxes Pixijs',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./circles-boxes-pixijs/circles-boxes-pixijs'))
  },
  {
    path: '/canvas',
    name: 'Canvas',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./canvas/intersecting-circles'))
  },
  {
    path: '/dev',
    name: 'Dev',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('./dev/dev'))
  }
];

export const escyRoutes: Routes = {
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
      component: () => <Navigation routes={routes} parentPath="." />
    },
    ...routes
  ]
};
