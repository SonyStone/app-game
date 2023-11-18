import { createCookieStorage } from '@solid-primitives/storage';
import { useRoutes } from '@solidjs/router';
import { ErrorBoundary } from 'solid-js';

import Noise from './noise/Noise';
import { routes } from './routes';
import { useStats } from './Stats.provider';

export function App() {
  const Routes = useRoutes(routes);
  const stats = useStats();

  stats.showPanel(1);
  stats.dom.style.left = 'unset';
  stats.dom.style.right = '0';

  interface UserCreadential {
    uid: string;
    token: string;
  }
  const [storage, setStorage, { remove, clear }] = createCookieStorage<string>();
  const uid = storage.uid;

  return (
    <>
      {stats.dom}

      <ErrorBoundary
        fallback={(error) => {
          console.error(error);
          return <div>Error in the App</div>;
        }}
      >
        <Routes />
      </ErrorBoundary>
      <Noise />
    </>
  );
}
