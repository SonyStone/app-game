import { Router } from '@solidjs/router';

import { routes } from './routes';

export function App() {
  return (
    <>
      <Router>{routes}</Router>
      {/* <Noise /> */}
    </>
  );
}
