import type { Component } from 'solid-js';
import { lazy } from 'solid-js';

type ExplorerRoute = {
  path: string;
  name: string;
  Preview: Component<{ name: string; path: string }>;
  component: ReturnType<typeof lazy>;
};

/** Mounts Bookmarks Explorer inside the shared app-game web router. */
export const bookmarksExplorerRoutes = {
  path: '/bookmarks-explorer',
  name: 'Bookmarks Explorer',
  Preview: (props) => (
    <a class="rounded-2 flex place-content-center border border-slate-200 p-2" href={props.path}>
      {props.name}
    </a>
  ),
  component: lazy(() => import('./WebApp'))
} satisfies ExplorerRoute;
