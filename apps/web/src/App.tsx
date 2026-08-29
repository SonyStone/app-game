import { createRouter } from '@solidjs/router';
import { Loading } from 'solid-js';

import { routes } from './routes';

const Router = createRouter({ routes });

export function App() {
  return (
    <Loading fallback={<div class="grid min-h-screen place-items-center">Loading…</div>}>
      <Router />
    </Loading>
  );
}
