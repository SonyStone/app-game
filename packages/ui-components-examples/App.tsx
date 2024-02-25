import { Link, RouteDefinition, Routes, useRoutes } from 'solid-app-router';
import { lazy } from 'solid-js';

import s from './App.module.css';
import { CounterProvider } from './TestContext';
import { withProviders } from './utils/withProviders';

const routes: RouteDefinition[] = [
  {
    path: "/users",
    component: withProviders(lazy(() => import('./pages/Users')))
      .use(CounterProvider)
      .build(),
    children: [
      {
        path: "/",
        component: () => null,
      },
      {
        path: "/settings",
        component: lazy(() => import('./pages/Settings')),
      },
    ],
  },
  {
    path: "/",
    component: withProviders(lazy(() => import('./pages/Index')))
      .use(CounterProvider)
      .build(),
  },
];

export function App() {
  const Routes = useRoutes(routes);

  return (<>
    <header class={s.header}>
      <Link href="/">home</Link>
      <Link href="/users">users</Link>
      <Link href="/users/settings">users/settings</Link>
    </header>
    <main>
      
        <Routes />
      
    </main>
  </>
  )
};

