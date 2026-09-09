import { createMediaQuery } from '@solid-primitives/media';
import { createSignal, Show } from 'solid-js';
import { createScreenRoute } from './createScreenRoute';
import type { VerticalGesture } from './createVerticalGesture';
import { FolderContent } from './FolderContent';
import { folders } from './folders';
import { FolderStack } from './FolderStack';
import ArrowUpRightIcon from './icons/arrow-up-right.svg';
import ArrowUpRightBoldIcon from './icons/arrow-up-right-bold.svg';
import BatteryIcon from './icons/battery.svg';
import SignalIcon from './icons/signal.svg';
import WifiIcon from './icons/wifi.svg';

/** The reference's device-screen composition, with reversible folder gestures. */
export function App() {
  const narrow = typeof window.matchMedia === 'function' ? createMediaQuery('(max-width: 600px)') : () => false;
  const [screen, setScreen] = createSignal<HTMLDivElement>();
  // This motion demo keeps its choreography independent of OS motion preferences.
  const route = createScreenRoute(() => false, screen);
  const [order, setOrder] = createSignal<string[]>(folders.map((folder) => folder.id));

  function select(id: string) {
    setOrder((previous) => {
      const index = previous.indexOf(id);
      if (index < 0 || index === previous.length - 1) return previous;
      return [...previous.slice(index + 1), ...previous.slice(0, index + 1)];
    });
  }

  function cycle(gesture: VerticalGesture) {
    if (gesture.direction !== 'down') return;
    setOrder((previous) => {
      const last = previous.at(-1);
      return last ? [last, ...previous.slice(0, -1)] : previous;
    });
  }

  return (
    <main class={`app ${route.fullscreen() ? 'is-fullscreen' : 'is-preview'}`} data-playing="true">
      <h1 class="sr-only">Creative folders</h1>
      <p class="sr-only" id="gesture-help">
        Drag any tab up to gather the current deck into a scrolling row without changing the open folder. Swipe tabs
        sideways to scroll the compact row, or drag sideways in the expanded stack to sort tabs. Diagonal gestures combine sorting and expansion. Scroll over the compact tabs, or use the preview scroll arrows. Pull a
        rear tab down to open its folder while holding it; keep pulling to the bottom to open the folder behind it.
        Return to the starting position to cancel. Drag down to expand the stack and keep pulling to open the next
        folder in one gesture. Selecting a tab moves the cards in front of it to the back. You can also use arrow keys.
        In full screen, use the tabs for vertical deck gestures; drag or scroll the content vertically.
      </p>
      <Show when={!route.fullscreen()}>
        <div class="preview-actions">
          <a class="screen-route-control" href="/fullscreen" onClick={(event) => route.navigate(event, '/fullscreen')}>
            <span class="screen-route-label">Open full screen</span>
            <span class="screen-route-symbol" aria-hidden="true">
              <ArrowUpRightBoldIcon class="icon" />
            </span>
          </a>
        </div>
      </Show>
      <AuthorCredit />
      <div class="device-frame">
        <div class="workspace" ref={setScreen} aria-describedby="gesture-help">
          <div class="workspace-topline">
            <span>
              <strong>9:41</strong> Mon Apr 26
            </span>
            <span class="status-icons" aria-label="Full signal, Wi-Fi connected, battery full">
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </span>
          </div>
          <FolderStack
            items={folders}
            order={order()}
            onSelect={select}
            onGesture={cycle}
            geometryUnit={route.fullscreen() ? (narrow() ? 6 : 9) : undefined}
            initiallyCollapsed={route.fullscreen()}
            scrollableContent={route.fullscreen()}
          >
            {(folder, active, next) => (
              <FolderContent
                folder={folder}
                onNext={next}
                scrollable={route.fullscreen()}
                onPreview={route.fullscreen() && active() ? (event) => route.navigate(event, '/') : undefined}
              />
            )}
          </FolderStack>
          <span class="screen-corner" aria-hidden="true" />
        </div>
      </div>
      <AuthorCredit />
    </main>
  );
}

/** Credits the original concept and opens the supplied source post in a new tab. */
function AuthorCredit() {
  return (
    <a
      class="author-credit"
      href="https://x.com/slavakornilov/status/2096724597080989846"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Original design by Slava Kornilov. View the original post on X, opens in a new tab."
    >
      <span class="credit-author">
        <span class="credit-label">Original design</span>
        <span class="credit-name">Slava Kornilov</span>
      </span>
      <span class="credit-source">View original on X</span>
      <span class="credit-arrow">
        <ArrowUpRightIcon class="icon" aria-hidden="true" />
      </span>
    </a>
  );
}
