import { Thumbnail, type Routes } from '@app-game/app-router';
import { lazy } from 'solid-js';

/** The same mounted folder deck serves preview and fullscreen navigation. */
export const cardStackRoutes = {
  path: '/card-stack',
  name: 'Card Stack',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./RoutedFolders')),
  children: [{ path: '/' }, { path: '/fullscreen' }]
} satisfies Routes;

/** A second skin using the same card stack library. */
export const notebookRoute = {
  path: '/card-stack/notebook',
  name: 'Card Stack · Notebook',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./RoutedNotebook'))
} satisfies Routes;
