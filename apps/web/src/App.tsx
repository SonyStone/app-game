import { createRouter } from '@solidjs/router';

import { routes } from './routes';

const Router = createRouter({ routes });

export function App() {
  return <Router />;
}
