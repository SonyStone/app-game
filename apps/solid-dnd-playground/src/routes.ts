import { lazy } from 'solid-js';
import App from './App';

export const routes = {
  path: '/',
  component: App,
  children: [
    {
      path: ['/sensor', '/'],
      component: lazy(() => import('./demos/SensorDemo'))
    },
    {
      path: '/sortable-overlay',
      component: lazy(() => import('./demos/SortableOverlayDemo'))
    },
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
