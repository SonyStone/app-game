import { Thumbnail, type Routes } from '@app-game/app-router';
import { lazy } from 'solid-js';

/** Adds the PSD viewer to the shared app-game navigation. */
export const psdViewerRoutes = {
  path: '/psd-viewer',
  name: 'PSD Viewer',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./App').then((module) => ({ default: module.App })))
} satisfies Routes;
