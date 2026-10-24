import type { SelectionAction } from '@app-game/paint-core/protocol';
import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { maximumDelay, minimumDelay, type QuickShapePreferences } from '../../features/quickshape';
import styles from './ActionsPopover.module.css';
import { ProcreateIcon, type ProcreateIconName } from './icons';
import menu from './menu.module.css';
import { Slider } from './Slider';

/**
 * Procreate's Actions popover, with the tabs and items Paint can do. Add: insert a photo as a new layer, cut, copy and
 * paste the selection. Canvas: flip the view horizontally, the symmetry drawing guide and view resets. Share: save
 * as `.paint`, export PSD or PNG. Prefs: which side the sidebar is on, full screen, the Pen window (palm rejection)
 * and QuickShape's Draw and Hold with its delay, as in Procreate's gesture controls. Help: the touch gestures.
 * File and share actions close the popover through their callbacks' callers.
 */
export function ActionsPopover(props: {
  ready: boolean;
  /** Something is selected, so Cut and Copy apply. */
  selected: boolean;
  hasClipboard: boolean;
  mirrored: boolean;
  symmetry: PaintSymmetry['mode'];
  sidebar: 'left' | 'right';
  /** `shown` is false where full screen is not a choice, such as the Android shell app. */
  fullscreen: { active: boolean; supported: boolean; shown: boolean };
  onInsertPhoto: (file: File) => void;
  onSelectionAction: (action: SelectionAction) => void;
  onFlip: () => void;
  onSymmetry: (mode: PaintSymmetry['mode']) => void;
  onResetView: () => void;
  onResetRotation: () => void;
  onShare: (format: 'download' | 'psd' | 'png') => void;
  onSidebar: (side: 'left' | 'right') => void;
  onFullscreen: () => void;
  /** Opens the session's Pen window. */
  onPen: () => void;
  quickShape: QuickShapePreferences;
  onQuickShape: (patch: Partial<QuickShapePreferences>) => void;
}) {
  const [tab, setTab] = createSignal<Tab>('add');
  // Follows the stored delay, and the drag in between.
  const [delay, setDelay] = createSignal(() => props.quickShape.delay);
  let photo!: HTMLInputElement;

  return (
    <>
      <nav class={menu.tabs} role="tablist" aria-label="Actions">
        <For each={tabs}>
          {(item) => (
            <button role="tab" aria-selected={tab() === item.id ? 'true' : 'false'} onClick={() => setTab(item.id)}>
              <ProcreateIcon name={item.icon} size={24} />
              {item.label}
            </button>
          )}
        </For>
      </nav>
      <div class={menu.list} role="tabpanel">
        <Switch>
          <Match when={tab() === 'add'}>
            <input
              ref={photo}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const input = event.currentTarget;
                const picked = input.files?.[0];
                input.value = '';
                if (picked) {
                  props.onInsertPhoto(picked);
                }
              }}
            />
            <button class={menu.row} disabled={!props.ready} onClick={() => photo.click()}>
              <span class={menu.label}>Insert a photo</span>
              <span class={menu.detail}>New layer</span>
            </button>
            <button
              class={menu.row}
              disabled={!props.ready || !props.selected}
              onClick={() => props.onSelectionAction('cut')}
            >
              <span class={menu.label}>Cut</span>
            </button>
            <button
              class={menu.row}
              disabled={!props.ready || !props.selected}
              onClick={() => props.onSelectionAction('copy')}
            >
              <span class={menu.label}>Copy</span>
            </button>
            <button
              class={menu.row}
              disabled={!props.ready || !props.hasClipboard}
              onClick={() => props.onSelectionAction('paste')}
            >
              <span class={menu.label}>Paste</span>
            </button>
          </Match>
          <Match when={tab() === 'canvas'}>
            <button
              class={menu.row}
              role="switch"
              aria-checked={props.mirrored ? 'true' : 'false'}
              onClick={() => props.onFlip()}
            >
              <span class={menu.label}>Flip canvas horizontally</span>
              <span class={menu.switch} />
            </button>
            <h3 class={menu.sectionTitle}>Drawing guide · Symmetry</h3>
            <div class={styles.segmented} role="radiogroup" aria-label="Symmetry">
              <For each={symmetryModes}>
                {(mode) => (
                  <button
                    role="radio"
                    aria-checked={props.symmetry === mode.id ? 'true' : 'false'}
                    disabled={!props.ready}
                    onClick={() => props.onSymmetry(mode.id)}
                  >
                    {mode.label}
                  </button>
                )}
              </For>
            </div>
            <button class={menu.row} onClick={() => props.onResetView()}>
              <span class={menu.label}>Reset view</span>
              <span class={menu.detail}>Zoom, rotation and position</span>
            </button>
            <button class={menu.row} onClick={() => props.onResetRotation()}>
              <span class={menu.label}>Reset rotation</span>
            </button>
          </Match>
          <Match when={tab() === 'share'}>
            <h3 class={menu.sectionTitle}>Share image</h3>
            <For each={shareFormats}>
              {(format) => (
                <button class={menu.row} disabled={!props.ready} onClick={() => props.onShare(format.id)}>
                  <span class={menu.label}>{format.label}</span>
                  <span class={menu.detail}>{format.detail}</span>
                </button>
              )}
            </For>
          </Match>
          <Match when={tab() === 'prefs'}>
            <button
              class={menu.row}
              role="switch"
              aria-checked={props.sidebar === 'right' ? 'true' : 'false'}
              onClick={() => props.onSidebar(props.sidebar === 'right' ? 'left' : 'right')}
            >
              <span class={menu.label}>Right-hand interface</span>
              <span class={menu.switch} />
            </button>
            <Show when={props.fullscreen.shown}>
              <button
                class={menu.row}
                role="switch"
                aria-checked={props.fullscreen.active ? 'true' : 'false'}
                disabled={!props.fullscreen.supported}
                onClick={() => props.onFullscreen()}
              >
                <span class={menu.label}>Full screen</span>
                <Show when={props.fullscreen.supported} fallback={<span class={menu.detail}>Unavailable</span>}>
                  <span class={menu.switch} />
                </Show>
              </button>
            </Show>
            <button class={menu.row} onClick={() => props.onPen()}>
              <span class={menu.label}>Pen</span>
              <span class={menu.detail}>Palm rejection, pen hover</span>
            </button>
            <h3 class={menu.sectionTitle}>QuickShape</h3>
            <button
              class={menu.row}
              role="switch"
              aria-checked={props.quickShape.enabled ? 'true' : 'false'}
              onClick={() => props.onQuickShape({ enabled: !props.quickShape.enabled })}
            >
              <span class={menu.label}>Draw and hold</span>
              <span class={menu.switch} />
            </button>
            <div class={styles.delay}>
              <span>Delay</span>
              <Slider
                label="QuickShape delay"
                min={minimumDelay}
                max={maximumDelay}
                value={delay()}
                valueText={seconds(delay())}
                disabled={!props.quickShape.enabled}
                onInput={setDelay}
                onChange={(next) => {
                  setDelay(next);
                  props.onQuickShape({ delay: next });
                }}
              />
              <output>{seconds(delay())}</output>
            </div>
          </Match>
          <Match when={tab() === 'help'}>
            <dl class={menu.help}>
              <For each={gestures}>
                {(gesture) => (
                  <>
                    <dt>{gesture.gesture}</dt>
                    <dd>{gesture.action}</dd>
                  </>
                )}
              </For>
            </dl>
          </Match>
        </Switch>
      </div>
    </>
  );
}

type Tab = 'add' | 'canvas' | 'share' | 'prefs' | 'help';

/** A delay in milliseconds as Procreate shows it, in seconds with two decimals. */
function seconds(ms: number) {
  return `${(ms / 1000).toFixed(2)} s`;
}

const tabs: { id: Tab; label: string; icon: ProcreateIconName }[] = [
  { id: 'add', label: 'Add', icon: 'add' },
  { id: 'canvas', label: 'Canvas', icon: 'canvas' },
  { id: 'share', label: 'Share', icon: 'share' },
  { id: 'prefs', label: 'Prefs', icon: 'prefs' },
  { id: 'help', label: 'Help', icon: 'help' }
];

const symmetryModes: { id: PaintSymmetry['mode']; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'dual', label: 'Quadrant' },
  { id: 'radial', label: 'Radial' }
];

const shareFormats: { id: 'download' | 'psd' | 'png'; label: string; detail: string }[] = [
  { id: 'download', label: 'Paint', detail: '.paint, every layer' },
  { id: 'psd', label: 'PSD', detail: 'Photoshop layers' },
  { id: 'png', label: 'PNG', detail: 'The visible canvas' }
];

/** The gestures of this variant, as Procreate's gesture controls describe them. */
const gestures = [
  { gesture: 'Pen', action: 'Paint, erase or select with the active tool.' },
  { gesture: 'Draw and hold', action: 'QuickShape: the stroke becomes a line, arc, ellipse or polygon.' },
  { gesture: 'Two-finger tap', action: 'Undo.' },
  { gesture: 'Three-finger tap', action: 'Redo.' },
  { gesture: 'Four-finger tap', action: 'Hide or show the interface.' },
  { gesture: 'Touch and hold', action: 'Eyedropper: pick the color under your finger.' },
  { gesture: 'Pinch, twist, drag', action: 'Zoom, rotate and move the canvas.' },
  { gesture: 'Space, right click or pen button', action: 'Navigation puck for the mouse and pen.' },
  { gesture: 'Modify button', action: 'Tap, then touch the canvas to pick a color.' }
];
