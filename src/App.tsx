import { Router } from '@solidjs/router';
import { ErrorBoundary } from 'solid-js';

import Noise from './noise/Noise';
import { routes } from './routes';

export function App() {
  return (
    <>
      <ErrorBoundary
        fallback={(error) => {
          console.error(error);
          return <div>Error in the App</div>;
        }}
      >
        <Router>{routes}</Router>
      </ErrorBoundary>
      <Noise />
    </>
  );
}
