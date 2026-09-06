import { Thumbnail, type Routes } from '@app-game/app-router';
import { lazy } from 'solid-js';

/** Adds the brush editor to the shared app-game navigation. */
export const abrViewerRoutes = {
  path: '/abr-viewer',
  name: 'ABR Viewer',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./App').then((module) => ({ default: module.App })))
} satisfies Routes;
