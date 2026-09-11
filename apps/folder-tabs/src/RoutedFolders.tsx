import { useLocation, useNavigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { App } from './App';
import styles from './routes.module.css';

/** Integrates the demo with the host history while retaining its continuity transition. */
export default function RoutedFolders() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <Show when={!location.pathname.endsWith('/fullscreen')}>
        <nav class={styles.navigation} aria-label="Card Stack examples">
          <a href="/">← Examples</a>
          <a href="/card-stack/notebook">Notebook example →</a>
        </nav>
      </Show>
      <App routing={{ basePath: '/card-stack', navigate: (path) => navigate(path, { resolve: false, scroll: false }) }} />
    </>
  );
}
