import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { lazy } from 'solid-js';

export const filmAnnotationPlayerRoutes: Routes = {
  path: '/player',
  name: 'Player',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./App'))
};
