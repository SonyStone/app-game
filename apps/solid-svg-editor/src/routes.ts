import { lazy } from 'solid-js';

export const routes = {
  path: '/',
  children: [
    {
      path: '/',
      component: lazy(() => import('./App'))
    },
    {
      path: '/overview',
      component: lazy(() => import('./pages/OverviewPage'))
    }
  ]
};
