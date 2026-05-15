import { createSignal, Match, Switch, type JSX } from 'solid-js';
import DragFixture from './fixtures/DragFixture';
import FlipFixture from './fixtures/FlipFixture';
import OverlayFixture from './fixtures/OverlayFixture';
import SortableFixture from './fixtures/SortableFixture';

// ============================================================================
// MARK: App — simple hash-based routing for test fixtures
// ============================================================================

type FixtureName = 'flip' | 'drag' | 'sortable' | 'overlay';

function getFixture(): FixtureName {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'flip' || hash === 'drag' || hash === 'sortable' || hash === 'overlay') return hash;
  return 'flip';
}

export default function App(): JSX.Element {
  const [fixture, setFixture] = createSignal<FixtureName>(getFixture());

  // Listen for hash changes so Playwright can navigate via page.goto('/#flip')
  window.addEventListener('hashchange', () => setFixture(getFixture()));

  return (
    <div style={{ padding: '16px' }}>
      <nav style={{ display: 'flex', gap: '8px', 'margin-bottom': '16px' }}>
        <a href="#flip" data-nav="flip">
          FLIP
        </a>
        <a href="#drag" data-nav="drag">
          Drag
        </a>
        <a href="#sortable" data-nav="sortable">
          Sortable
        </a>
        <a href="#overlay" data-nav="overlay">
          Overlay
        </a>
      </nav>

      <Switch>
        <Match when={fixture() === 'flip'}>
          <FlipFixture />
        </Match>
        <Match when={fixture() === 'drag'}>
          <DragFixture />
        </Match>
        <Match when={fixture() === 'sortable'}>
          <SortableFixture />
        </Match>
        <Match when={fixture() === 'overlay'}>
          <OverlayFixture />
        </Match>
      </Switch>
    </div>
  );
}
