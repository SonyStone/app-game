import { Thumbnail, type Routes } from '@app-game/app-router';
import { lazy } from 'solid-js';

export const bookmarksExplorerRoutes: Routes = {
  path: '/bookmarks-explorer',
  name: 'Bookmarks Explorer',
  Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
  component: lazy(() => import('./index'))
};
