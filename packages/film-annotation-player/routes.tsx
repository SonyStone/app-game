import { Thumbnail, type Routes } from '@app-game/app-router';
import { lazy } from 'solid-js';

export const filmAnnotationPlayerRoutes: Routes = {
  path: '/player',
  name: 'Player',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./App'))
};
