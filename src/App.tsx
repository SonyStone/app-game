import { Router } from '@solidjs/router';

import Noise from './noise/Noise';
import { routes } from './routes';

export function App() {
  return (
    <>
      <Router>{routes}</Router>
      <Noise />
    </>
  );
}
