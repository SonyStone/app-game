import type { Component } from 'solid-js';
import { lazy } from 'solid-js';

type ExplorerRoute = {
  path: string;
  name: string;
  Preview: Component<{ name: string; path: string }>;
  component: ReturnType<typeof lazy>;
};

/** Mounts Browser Atlas inside the shared app-game web router. */
export const browserAtlasRoutes = {
  path: '/browser-atlas',
  name: 'Browser Atlas',
  Preview: (props) => (
    <a class="rounded-2 flex place-content-center border border-slate-200 p-2" href={props.path}>
      {props.name}
    </a>
  ),
  component: lazy(() => import('./WebApp'))
} satisfies ExplorerRoute;
