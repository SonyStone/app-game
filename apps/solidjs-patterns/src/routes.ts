import { lazy } from 'solid-js';
import { App } from './App';

export const routes = {
  path: '/',
  component: App,
  children: [
    { path: ['/', '/overview'], component: lazy(() => import('./pages/OverviewPage')) },
    { path: '/signals', component: lazy(() => import('./pages/SignalsPage')) },
    { path: '/derived', component: lazy(() => import('./pages/DerivedPage')) },
    { path: '/effects', component: lazy(() => import('./pages/EffectsPage')) },
    { path: '/batching', component: lazy(() => import('./pages/BatchingPage')) },
    { path: '/stores', component: lazy(() => import('./pages/StorePage')) },
    { path: '/context', component: lazy(() => import('./pages/ContextPage')) },
    { path: '/components', component: lazy(() => import('./pages/ComponentsPage')) },
    { path: '/control-flow', component: lazy(() => import('./pages/ControlFlowPage')) },
    { path: '/props', component: lazy(() => import('./pages/PropsPage')) },
    { path: '/resources', component: lazy(() => import('./pages/ResourcesPage')) },
    { path: '/suspense', component: lazy(() => import('./pages/SuspensePage')) },
    { path: '/primitives', component: lazy(() => import('./pages/PrimitivesPage')) },
    { path: '/directives', component: lazy(() => import('./pages/DirectivesPage')) }
  ]
};
