import { lazy } from 'solid-js';
import { App } from './App';

export const routes = {
  path: '/',
  component: App,
  children: [
    { path: ['/', '/overview'], component: lazy(() => import('./pages/overview/OverviewPage')) },
    { path: '/signals', component: lazy(() => import('./pages/signals/SignalsPage')) },
    { path: '/derived', component: lazy(() => import('./pages/derived/DerivedPage')) },
    { path: '/effects', component: lazy(() => import('./pages/effects/EffectsPage')) },
    { path: '/batching', component: lazy(() => import('./pages/batching/BatchingPage')) },
    { path: '/stores', component: lazy(() => import('./pages/stores/StorePage')) },
    { path: '/context', component: lazy(() => import('./pages/context/ContextPage')) },
    { path: '/components', component: lazy(() => import('./pages/components/ComponentsPage')) },
    { path: '/control-flow', component: lazy(() => import('./pages/control-flow/ControlFlowPage')) },
    { path: '/props', component: lazy(() => import('./pages/props/PropsPage')) },

    // testing different approaches to rendering markdown/json/html content with interactive components
    { path: '/pass-data', component: lazy(() => import('./pages/pass-data/PassDataPage')) },
    { path: '/pass-data-2', component: lazy(() => import('./pages/pass-data/PassDataPage2')) },
    { path: '/pass-data-3', component: lazy(() => import('./pages/pass-data/PassDataPage3')) },
    { path: '/pass-data-4', component: lazy(() => import('./pages/pass-data/PassDataPage4')) },
    { path: '/pass-data-markdown', component: lazy(() => import('./pages/pass-data-markdown/PassDataMarkdownPage')) },
    { path: '/pass-data-mdx', component: lazy(() => import('./pages/pass-data-mdx/PassDataMdxPage')) },
    { path: '/pass-data-mdx-2', component: lazy(() => import('./pages/pass-data-mdx/PassDataMdxPage2')) },

    { path: '/resources', component: lazy(() => import('./pages/resources/ResourcesPage')) },
    { path: '/suspense', component: lazy(() => import('./pages/suspense/SuspensePage')) },
    { path: '/primitives', component: lazy(() => import('./pages/primitives/PrimitivesPage')) },
    { path: '/owner-computation', component: lazy(() => import('./pages/owner-computation/OwnerComputationPage')) },
    { path: '/directives', component: lazy(() => import('./pages/directives/DirectivesPage')) }
  ]
};
