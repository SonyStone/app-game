import { AuthorCredit } from './AuthorCredit';
import { createMediaQuery } from '@solid-primitives/media';
import { createSignal, Show } from 'solid-js';
import { createScreenRoute } from './createScreenRoute';
import { FolderContent } from './FolderContent';
import { folders } from './folders';
import { FolderStack } from './FolderStack';
import ArrowUpRightBoldIcon from './icons/arrow-up-right-bold.svg';
import BatteryIcon from './icons/battery.svg';
import SignalIcon from './icons/signal.svg';
import WifiIcon from './icons/wifi.svg';
import styles from './App.module.css';

/** The reference's device-screen composition, with reversible folder gestures. */
export function App(props: { routing?: Parameters<typeof createScreenRoute>[2] } = {}) {
  const narrow = typeof window.matchMedia === 'function' ? createMediaQuery('(max-width: 600px)') : () => false;
  const [screen, setScreen] = createSignal<HTMLDivElement>();
  // This motion demo keeps its choreography independent of OS motion preferences.
  const route = createScreenRoute(() => false, screen, props.routing);
  return (
    <main class={`${styles.app} ${route.fullscreen() ? styles.isFullscreen : 'is-preview'}`} data-playing="true">
      <h1 class={styles.srOnly}>Creative folders</h1>
      <p class={styles.srOnly} id="gesture-help">
        Drag any tab up to gather the current deck into a scrolling row without changing the open folder. Swipe tabs
        sideways to scroll the compact row, or drag sideways in the expanded stack to sort tabs. Diagonal gestures
        combine sorting and expansion. Scroll over the compact tabs, or use the preview scroll arrows. Pull a rear tab
        down to spread the stack; pull farther to increase the spacing. Release after a deliberate downward pull to
        open that folder. Return to the starting position to cancel. Pull the active folder to the bottom and release
        to open the folder underneath. Selecting a tab moves the cards in front of it to the back. You can also use arrow keys. In full
        screen, use the tabs for vertical deck gestures; drag or scroll the content vertically.
      </p>
      <Show when={!route.fullscreen()}>
        <div class={styles.previewActions}>
          <a
            class={styles.screenRouteControl}
            href={route.href('/fullscreen')}
            onClick={(event) => route.navigate(event, '/fullscreen')}
          >
            <span class={styles.screenRouteLabel}>Open full screen</span>
            <span class={styles.screenRouteSymbol} aria-hidden="true">
              <ArrowUpRightBoldIcon class={styles.icon} />
            </span>
          </a>
        </div>
        <AuthorCredit />
      </Show>
      <div class={styles.deviceFrame}>
        <div class={styles.workspace} ref={setScreen} aria-describedby="gesture-help">
          <div class={styles.workspaceTopline}>
            <span>
              <strong>9:41</strong> Mon Apr 26
            </span>
            <span class={styles.statusIcons} aria-label="Full signal, Wi-Fi connected, battery full">
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </span>
          </div>
          <FolderStack
            items={folders}
            geometryUnit={route.fullscreen() ? (narrow() ? 6 : 9) : undefined}
            initiallyCollapsed={route.fullscreen()}
            scrollableContent={route.fullscreen()}
          >
            {(folder, active, next) => (
              <FolderContent
                folder={folder}
                onNext={next}
                scrollable={route.fullscreen()}
                previewHref={route.href('/')}
                onPreview={route.fullscreen() && active() ? (event) => route.navigate(event, '/') : undefined}
              />
            )}
          </FolderStack>
          <span class={styles.screenCorner} aria-hidden="true" />
        </div>
      </div>
      <Show when={!route.fullscreen()}>
        <AuthorCredit />
      </Show>
    </main>
  );
}
