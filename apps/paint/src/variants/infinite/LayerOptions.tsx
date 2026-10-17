import type { BlendMode, LayerAction, LayerInfo } from '@app-game/paint-core/document';
import { createSignal, For, Show } from 'solid-js';
import { InfiniteIcon, type InfiniteIconName } from './icons';
import styles from './LayerOptions.module.css';
import { Slider } from './Slider';
import theme from './theme.module.css';

/**
 * Infinite Painter's layer options pop-up (manual p. 151): the layer's name (tap to rename), its blending mode, its
 * opacity, and a grid of commands: Hide, Duplicate, Clear, Lock (transparency), Merge (down), Delete, Clip, Select
 * and Mask. Every change goes to `onAction` as an undoable document edit. The blending-mode list is Infinite Painter's
 * thirty modes; Paint blends four of them, so the others are listed but disabled, as are Clear, Select and Mask, which
 * Paint's layers do not have.
 */
export function LayerOptions(props: {
  layer: LayerInfo;
  /** The layer is the bottom one, so it has nothing to merge into. */
  bottom: boolean;
  /** The drawing has only this layer, which cannot be deleted. */
  only: boolean;
  disabled?: boolean;
  onAction: (action: LayerAction) => void;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = createSignal(false);
  const [choosingBlend, setChoosingBlend] = createSignal(false);
  // Follows the layer's opacity, and the drag in between.
  const [draft, setDraft] = createSignal(() => props.layer.opacity);
  const update = (patch: Extract<LayerAction, { type: 'update' }>['patch']) =>
    props.onAction({ type: 'update', id: props.layer.id, patch });

  return (
    <div class={[theme.panel, styles.options]} role="dialog" aria-label={`Options of ${props.layer.name}`}>
      <Show
        when={renaming()}
        fallback={
          <button class={styles.name} title="Rename" disabled={props.disabled} onClick={() => setRenaming(true)}>
            {props.layer.name}
          </button>
        }
      >
        <input
          class={styles.nameField}
          aria-label="Layer name"
          value={props.layer.name}
          ref={(field) => queueMicrotask(() => field.select())}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim();
            setRenaming(false);
            if (name && name !== props.layer.name) {
              update({ name });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.currentTarget.blur();
            }
          }}
        />
      </Show>

      <Show
        when={choosingBlend()}
        fallback={
          <>
            <button
              class={styles.blend}
              disabled={props.disabled}
              aria-haspopup="listbox"
              onClick={() => setChoosingBlend(true)}
            >
              {blendName(props.layer.blend)}
            </button>
            <Slider
              label="Opacity"
              value={Math.round(draft() * 100)}
              min={0}
              max={100}
              step={1}
              disabled={props.disabled}
              onInput={(value) => setDraft(value / 100)}
              onChange={(value) => {
                setDraft(value / 100);
                update({ opacity: value / 100 });
              }}
            />
            <div class={styles.grid}>
              <Command
                icon={props.layer.visible ? 'eyeOff' : 'eye'}
                label={props.layer.visible ? 'Hide' : 'Show'}
                disabled={props.disabled}
                onClick={() => update({ visible: !props.layer.visible })}
              />
              <Command
                icon="duplicate"
                label="Duplicate"
                disabled={props.disabled}
                onClick={() => props.onAction({ type: 'duplicate', id: props.layer.id })}
              />
              <Command icon="clear" label="Clear" disabled missing />
              <Command
                icon="alphaLock"
                label="Lock"
                pressed={!!props.layer.alphaLock}
                disabled={props.disabled}
                onClick={() => update({ alphaLock: !props.layer.alphaLock })}
              />
              <Command
                icon="merge"
                label="Merge"
                disabled={props.disabled || props.bottom}
                onClick={() => {
                  props.onAction({ type: 'merge-down', id: props.layer.id });
                  props.onClose();
                }}
              />
              <Command
                icon="delete"
                label="Delete"
                disabled={props.disabled || props.only}
                onClick={() => {
                  props.onAction({ type: 'delete', id: props.layer.id });
                  props.onClose();
                }}
              />
              <Command
                icon="clip"
                label="Clip"
                pressed={!!props.layer.clipping}
                disabled={props.disabled}
                onClick={() => update({ clipping: !props.layer.clipping })}
              />
              <Command icon="select" label="Select" disabled missing />
              <Command icon="mask" label="Mask" disabled missing />
            </div>
          </>
        }
      >
        <div class={styles.modes} role="listbox" aria-label="Blending mode">
          <For each={blendGroups}>
            {(group) => (
              <div class={styles.modeGroup}>
                <For each={group}>
                  {(mode) => (
                    <button
                      class={styles.mode}
                      role="option"
                      aria-selected={props.layer.blend === mode.id ? 'true' : 'false'}
                      disabled={!mode.paint || props.disabled}
                      title={mode.paint ? mode.name : `${mode.name} · not in Paint`}
                      onClick={() => {
                        setChoosingBlend(false);
                        if (mode.paint && mode.id !== props.layer.blend) {
                          update({ blend: mode.paint });
                        }
                      }}
                    >
                      {mode.name}
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** One command of the grid; `missing` marks one that Paint's layers lack. */
function Command(props: {
  icon: InfiniteIconName;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  missing?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      class={theme.labeledIcon}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      disabled={props.disabled}
      title={props.missing ? `${props.label} · not in Paint` : props.label}
      onClick={() => props.onClick?.()}
    >
      <InfiniteIcon name={props.icon} size={20} />
      <span>{props.label}</span>
    </button>
  );
}

/** Infinite Painter's name of Paint's blend mode `mode`. */
export function blendName(mode: BlendMode) {
  return blendGroups.flat().find((entry) => entry.paint === mode)?.name ?? 'Normal';
}

/**
 * Infinite Painter's thirty blending modes in its groups (manual p. 180), each with the Paint mode it is, if Paint has
 * it.
 */
const blendGroups: readonly (readonly { id: string; name: string; paint?: BlendMode }[])[] = [
  [{ id: 'normal', name: 'Normal', paint: 'normal' }],
  [
    { id: 'darken', name: 'Darken' },
    { id: 'multiply', name: 'Multiply', paint: 'multiply' },
    { id: 'color-burn', name: 'Color Burn' },
    { id: 'linear-burn', name: 'Linear Burn' },
    { id: 'darker-color', name: 'Darker Color' }
  ],
  [
    { id: 'lighten', name: 'Lighten' },
    { id: 'screen', name: 'Screen', paint: 'screen' },
    { id: 'color-dodge', name: 'Color Dodge' },
    { id: 'linear-dodge', name: 'Linear Dodge' },
    { id: 'lighter-color', name: 'Lighter Color' }
  ],
  [
    { id: 'overlay', name: 'Overlay', paint: 'overlay' },
    { id: 'soft-light', name: 'Soft Light' },
    { id: 'hard-light', name: 'Hard Light' },
    { id: 'vivid-light', name: 'Vivid Light' },
    { id: 'linear-light', name: 'Linear Light' },
    { id: 'pin-light', name: 'Pin Light' },
    { id: 'hard-mix', name: 'Hard Mix' }
  ],
  [
    { id: 'difference', name: 'Difference' },
    { id: 'exclusion', name: 'Exclusion' },
    { id: 'negative', name: 'Negative' }
  ],
  [
    { id: 'subtract', name: 'Subtract' },
    { id: 'divide', name: 'Divide' }
  ],
  [
    { id: 'hue', name: 'Hue' },
    { id: 'saturation', name: 'Saturation' },
    { id: 'color', name: 'Color' },
    { id: 'luminosity', name: 'Luminosity' }
  ],
  [
    { id: 'erase', name: 'Erase' },
    { id: 'mask', name: 'Mask' },
    { id: 'line-art', name: 'Line Art' }
  ]
];
