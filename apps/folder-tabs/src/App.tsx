import { createSignal } from 'solid-js';
import type { VerticalGesture } from './createVerticalGesture';
import { FolderContent } from './FolderContent';
import { folders } from './folders';
import { FolderStack } from './FolderStack';
import ArrowUpRightIcon from './icons/arrow-up-right.svg';
import BatteryIcon from './icons/battery.svg';
import SignalIcon from './icons/signal.svg';
import WifiIcon from './icons/wifi.svg';

/** The reference's device-screen composition, with reversible folder gestures. */
export function App() {
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
    <main class="app" data-playing="true">
      <h1 class="sr-only">Creative folders</h1>
      <p class="sr-only" id="gesture-help">
        Drag up to gather the current deck into a scrolling row of full-size tabs. Swipe the tabs or card sideways, scroll over
        the tabs, or use the scroll arrows. Pull a rear tab down to open its folder. Drag down to expand it, then down again to open the next folder. Selecting a tab
        moves the cards in front of it to the back. You can also use arrow keys.
      </p>
      <AuthorCredit />
      <div class="device-frame">
        <div class="workspace" aria-describedby="gesture-help">
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
          <FolderStack items={folders} order={order()} onSelect={select} onGesture={cycle}>
            {(folder, _active, next) => <FolderContent folder={folder} onNext={next} />}
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
