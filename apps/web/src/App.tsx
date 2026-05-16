import { Router } from '@solidjs/router';
import { Suspense } from 'solid-js';

import Noise from './noise/Noise';
import { routes } from './routes';

export function App() {
  return (
    <>
      <Suspense>
        <Router>{routes}</Router>
      </Suspense>
      <Noise />
    </>
  );
}
