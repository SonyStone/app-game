import { lazy } from 'solid-js';
import App from './App';

const sortableOverlayRoute = {
  path: '/sortable-overlay',
  component: lazy(() => import('./demos/SortableOverlayDemo'))
} as const;

export const routes = {
  path: '/',
  component: App,
  children: [
    {
      path: ['/sensor', '/'],
      component: lazy(() => import('./demos/SensorDemo'))
    },
    sortableOverlayRoute,
    {
      path: '/nested',
      component: lazy(() => import('./demos/NestedDemo'))
    },
    {
      path: '/nested-overlay',
      component: lazy(() => import('./demos/NestedOverlayDemo'))
    }
  ]
};
