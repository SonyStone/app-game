import { createSignal, For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { Growth } from './createGrowth';
import { growthProgress } from './growth';
import { featureNames } from './hints';
import styles from './panels.module.css';

/**
 * The dock's small menu: the "Show everything" switch, the drawing hand, fullscreen, the file commands once they have
 * grown, the controls still to come, each with how far away it is and a button to ask for it now, and "Start fresh",
 * which hides the grown controls again after a second tap. The link back to the Paint experiments closes the menu.
 */
export function GrowthMenu(props: {
  growth: Growth;
  ready: boolean;
  fullscreen: { active: boolean; supported: boolean; toggle: () => void };
  onOpen: (file: File) => void;
  onInsertImage: (file: File) => void;
  onSave: () => void;
  onExportPng: () => void;
  onExportPsd: () => void;
  experimentsHref: string | undefined;
  /** Closes the menu, after a command that leaves it. */
  onDone: () => void;
}) {
  const { growth } = props;
  const [confirming, setConfirming] = createSignal(false);
  let drawing!: HTMLInputElement;
  let image!: HTMLInputElement;
  const picked = (event: Event & { currentTarget: HTMLInputElement }, use: (file: File) => void) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      use(file);
    }
  };

  return (
    <>
      <header class={styles.header}>
        <h2>Paint</h2>
      </header>
      <div class={styles.scroll}>
        <button
          class={styles.switchRow}
          role="switch"
          aria-checked={growth.showEverything() ? 'true' : 'false'}
          onClick={() => growth.setShowEverything(!growth.showEverything())}
        >
          <span>Show everything</span>
          <span class={styles.switch} />
        </button>
        <div class={styles.menuRow}>
          <span>Pen hand</span>
          <div class={styles.segmented} role="radiogroup" aria-label="Pen hand">
            <For each={hands}>
              {(hand) => (
                <button
                  role="radio"
                  aria-checked={growth.hand() === hand.id ? 'true' : 'false'}
                  onClick={() => growth.setHand(hand.id)}
                >
                  {hand.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={props.fullscreen.supported}>
          <button class={styles.menuItem} onClick={() => props.fullscreen.toggle()}>
            <SketchIcon name={props.fullscreen.active ? 'fullscreenExit' : 'fullscreen'} size={16} />
            {props.fullscreen.active ? 'Leave fullscreen' : 'Fullscreen'}
          </button>
        </Show>
        <Show when={growth.has('export')}>
          <input
            ref={drawing}
            type="file"
            accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
            hidden
            onChange={(event) => picked(event, props.onOpen)}
          />
          <input
            ref={image}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => picked(event, props.onInsertImage)}
          />
          <h3 class={styles.subheading}>Drawing</h3>
          <button class={styles.menuItem} disabled={!props.ready} onClick={() => drawing.click()}>
            Open…<small>.paint, .psd</small>
          </button>
          <button class={styles.menuItem} disabled={!props.ready} onClick={() => props.onSave()}>
            Save<small>.paint</small>
          </button>
          <button class={styles.menuItem} disabled={!props.ready} onClick={() => props.onExportPng()}>
            Export image<small>PNG</small>
          </button>
          <button class={styles.menuItem} disabled={!props.ready} onClick={() => props.onExportPsd()}>
            Export layers<small>PSD</small>
          </button>
          <button class={styles.menuItem} disabled={!props.ready} onClick={() => image.click()}>
            Insert image…<small>new layer</small>
          </button>
        </Show>
        <Show when={!growth.showEverything() && growth.locked().length > 0}>
          <h3 class={styles.subheading}>Still to come</h3>
          <ul class={styles.locked}>
            <For each={growth.locked()}>
              {(feature) => (
                <li>
                  <span>
                    {featureNames[feature]}
                    <small>{growthProgress(feature, growth.usage())}</small>
                  </span>
                  <button class={styles.textButton} onClick={() => growth.request([feature])}>
                    Add
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <h3 class={styles.subheading}>Growth</h3>
        <button
          class={styles.menuItem}
          data-confirming={confirming() ? '' : undefined}
          onClick={() => {
            if (!confirming()) {
              setConfirming(true);
              return;
            }

            setConfirming(false);
            growth.startFresh();
            props.onDone();
          }}
        >
          <SketchIcon name="reset" size={16} />
          {confirming() ? 'Tap again to start fresh' : 'Start fresh'}
          <small>the drawing stays</small>
        </button>
        <Show when={props.experimentsHref}>
          {(href) => (
            <a class={styles.menuItem} href={href()}>
              <SketchIcon name="home" size={16} />
              Paint experiments
            </a>
          )}
        </Show>
      </div>
    </>
  );
}

const hands = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' }
] as const;
