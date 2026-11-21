import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import { besideRect } from '../board';
import {
  blendModeGroups,
  blendModeInfo,
  defaultBlendIf,
  layerColorHex,
  layerColorTags,
  paperPresets,
  type BlendIfRange,
  type LayerLockKind,
  type LayerLocks,
  type LayerNode,
  type LayersModel,
  type PsdBlendMode
} from './layersModel';
import styles from './LayersPrototype.module.css';

type PopoverPage = 'main' | 'blending' | 'mask' | 'locks' | 'color' | 'blendif';

/**
 * Native LEGO Paint Layer Properties popover (`popover="manual"`): a dark `.popup` plate carrying light
 * `--lego-tile` tiles, a native pointer-driven `Opacity` slider, fused toggle segments, icon actions, and
 * `.settingsRows` navigation to nested subpages (`Blending` with vertical Opacity & Fill sliders, `Mask`, `Locks`,
 * `Color tag`, and touch `Blend If`). Follows selection across tiles without closing-and-reopening flicker.
 *
 * Shows only what `model` offers (see `LayersModel`): its blend modes, and fill, locks, masks, groups, clearing,
 * colour tags and Blend If where it has them. A folder of a model whose folders only blend (`groups.blendOnly`) shows
 * its name, blend mode (Pass Through first) and opacity, visibility in place of the layer toggles, and Dup, Group,
 * Ungroup and Delete. A name is committed on Enter or blur and a slider on release, so each edit is one change of the
 * model. Duplicate, Group, Merge and Delete wait for `model.ready()`.
 */
export function LayerPropertiesPopover(props: {
  anchor: Element;
  layer: LayerNode;
  model: LayersModel;
  onClose: () => void;
}) {
  const [page, setPage] = createSignal<PopoverPage>('main');
  const [editingName, setEditingName] = createSignal(false);
  const [element, setElement] = createSignal<HTMLDivElement>();
  const [place, setPlace] = createSignal<{ x: number; y: number }>({ x: 16, y: 16 });

  const layer = () => props.layer;
  const model = () => props.model;
  const capabilities = () => props.model.capabilities;
  const busy = () => !props.model.ready();
  const update = (patch: Parameters<LayersModel['update']>[1]) => props.model.update(props.layer.id, patch);

  // Reset inline name editing and invalid mask subpage when selection switches to another layer.
  createEffect(
    () => props.layer.id,
    () => {
      nameDraft = false;
      setEditingName(false);
      if (page() === 'mask' && !props.layer.mask) {
        setPage('main');
      }
    }
  );

  // Re-position beside the active anchor tile whenever the popover mounts or follows selection.
  createEffect(
    () => ({ popover: element(), anchor: props.anchor }),
    ({ popover, anchor }) => {
      if (!popover) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const view = {
        width: Math.max(320, window.innerWidth || 1024),
        height: Math.max(320, window.innerHeight || 768)
      };
      const rect = {
        left: anchorRect.left,
        top: anchorRect.top,
        width: anchorRect.width || 60,
        height: anchorRect.height || 60
      };
      setPlace(besideRect(rect, { width: 276, height: 420 }, view));

      try {
        if (!popover.matches(':popover-open')) {
          popover.showPopover?.();
        }
      } catch {
        // Popover API unsupported in jsdom; fixed positioning still applies.
      }
    }
  );

  onCleanup(() => {
    const popover = element();
    try {
      if (popover?.matches(':popover-open')) {
        popover.hidePopover?.();
      }
    } catch {
      // Ignore jsdom popover teardown.
    }
  });

  // Single capture listener for outside presses; ignores clicks inside `[data-layers-strip]` so tiles can switch/toggle cleanly.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const popover = element();
      if (!popover || !(event.target instanceof Element)) {
        return;
      }

      if (popover.contains(event.target) || event.target.closest('[data-layers-strip]')) {
        return;
      }

      props.onClose();
    },
    { capture: true }
  );

  createEventListener(window, 'keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    if (editingName()) {
      nameDraft = false;
      setEditingName(false);
    } else if (page() !== 'main') {
      setPage('main');
    } else {
      props.onClose();
    }
  });

  /** Whether the name field still holds an edit to commit; Enter and the blur that may follow commit it once. */
  let nameDraft = false;
  const editName = () => {
    nameDraft = true;
    setEditingName(true);
  };

  /** Commits a nonempty changed name and leaves editing; an empty name keeps the old one. */
  const commitName = (value: string) => {
    if (!nameDraft) {
      return;
    }

    nameDraft = false;
    setEditingName(false);
    const name = value.trim();
    if (name && name !== layer().name) {
      update({ name });
    }
  };

  const modeLabel = () => blendModeInfo(layer().blend).label;
  /** A folder that blends but has no locks, clipping, mask or merging of its own; see `groups.blendOnly`. */
  const blendOnly = () => layer().type === 'group' && !!model().groups?.blendOnly;
  const isActiveMask = () => model().activeId() === layer().id && model().masks?.target() === 'mask';
  const availableModes = () =>
    capabilities().blendModes.filter((mode) => (layer().type === 'group' ? true : !mode.groupOnly));
  const hasLock = (kind: LayerLockKind) => capabilities().locks.includes(kind);
  /** The Locks page has more than the alpha lock that the quick toggles already carry. */
  const hasLocksPage = () => capabilities().locks.some((kind) => kind !== 'alpha') || capabilities().reference;
  const hasQuickToggles = () => hasLock('alpha') || capabilities().clipping || !!model().masks;
  const hasNavigation = () => hasLocksPage() || capabilities().colorTags || capabilities().blendIf;

  /** Adds a mask, or opens the Mask page of a node that has one; a folder has it too. Nothing without masks. */
  const maskButton = () => (
    <Show when={model().masks}>
      {(masks) => (
        <button
          type="button"
          class={styles.fusedBtn}
          aria-label={layer().mask ? 'Open mask settings' : 'Add mask'}
          aria-pressed={layer().mask ? 'true' : 'false'}
          onClick={() => {
            if (!layer().mask) {
              masks().add(layer().id);
            } else {
              setPage('mask');
            }
          }}
        >
          <span aria-hidden="true">◐</span>
          <span>{layer().mask ? 'Mask ›' : 'Mask'}</span>
        </button>
      )}
    </Show>
  );

  const locksSummary = () => {
    const active: string[] = [];
    if (layer().locks.alpha) {
      active.push('Alpha');
    }

    if (layer().locks.pixels) {
      active.push('Pixels');
    }

    if (layer().locks.position) {
      active.push('Move');
    }

    if (layer().locks.all) {
      active.push('All');
    }

    if (layer().reference) {
      active.push('Ref');
    }

    return active.length > 0 ? active.join(', ') : 'Off';
  };

  const blendIfModified = () => {
    const range = layer().blendIf;
    const isDefault = (r: BlendIfRange) => r[0] === 0 && r[1] === 0 && r[2] === 255 && r[3] === 255;
    return !isDefault(range.thisLayer) || !isDefault(range.underlying);
  };

  return (
    <div
      ref={setElement}
      class={styles.popover}
      popover="manual"
      role="dialog"
      aria-label={`Layer properties: ${layer().name}`}
      data-keeps-panel
      style={{ left: `${place().x}px`, top: `${place().y}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* MAIN PAGE */}
      <Show when={page() === 'main'}>
        <div class={styles.popGrid}>
          {/* 1. Light header tile: 1×1 thumb + 5×1 inline editable name */}
          <div class={styles.nameCard}>
            <div class={styles.nameThumb}>
              <Show when={layer().type !== 'group'} fallback={<SketchIcon name="folder" size={16} />}>
                <Show when={layer().thumb} fallback={<SketchIcon name="paper" size={16} />}>
                  {(src) => <img src={src()} alt="" />}
                </Show>
              </Show>
            </div>
            <Show
              when={editingName()}
              fallback={
                <button type="button" class={styles.nameBtn} aria-label="Rename layer" onClick={editName}>
                  <span class={styles.nameText}>{layer().name}</span>
                  <SketchIcon name="pencil" size={14} />
                </button>
              }
            >
              <input
                type="text"
                class={styles.nameInput}
                aria-label="Layer name"
                maxlength={64}
                value={layer().name}
                autofocus
                onBlur={(event) => commitName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitName(event.currentTarget.value);
                  }
                }}
              />
            </Show>
          </div>

          {/* 2. Blend mode light tile */}
          <button
            type="button"
            class={styles.tileRowBtn}
            aria-label="Open blend modes"
            onClick={() => setPage('blending')}
          >
            <span class={styles.tileRowLead}>
              <SketchIcon name="gradient" size={16} />
              <span>Blend mode</span>
            </span>
            <span class={styles.tileRowValue}>
              {modeLabel()} <span aria-hidden="true">›</span>
            </span>
          </button>

          {/* 3. Native LEGO Opacity slider tile (no native <input type="range">) */}
          <LegoSlider label="Opacity" value={layer().opacity} onChange={(opacity) => update({ opacity })} />

          {/* 4. A blending folder's visibility, in place of the layer toggles it does not have */}
          <Show when={blendOnly()}>
            <div class={styles.fusedRow} role="group" aria-label="Folder visibility">
              <button
                type="button"
                class={styles.fusedBtn}
                aria-pressed={layer().visible ? 'true' : 'false'}
                onClick={() => update({ visible: !layer().visible })}
              >
                <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={14} />
                <span>{layer().visible ? 'Shown' : 'Hidden'}</span>
              </button>
              {maskButton()}
            </div>
          </Show>

          {/* 4. Fused main toggle tiles: α Lock | ↳ Clip | ◐ Mask › */}
          <Show when={hasQuickToggles() && !blendOnly()}>
            <div class={styles.fusedRow} role="group" aria-label="Layer quick toggles">
              <Show when={hasLock('alpha')}>
                <button
                  type="button"
                  class={styles.fusedBtn}
                  aria-pressed={layer().locks.alpha ? 'true' : 'false'}
                  onClick={() => update({ locks: { alpha: !layer().locks.alpha } })}
                >
                  <span aria-hidden="true">α</span>
                  <span>Lock</span>
                </button>
              </Show>
              <Show when={capabilities().clipping}>
                <button
                  type="button"
                  class={styles.fusedBtn}
                  aria-pressed={layer().clipping ? 'true' : 'false'}
                  onClick={() => update({ clipping: !layer().clipping })}
                >
                  <span aria-hidden="true">↳</span>
                  <span>Clip</span>
                </button>
              </Show>
              {maskButton()}
            </div>
          </Show>

          {/* 5. Icon actions row: Duplicate, Group, Merge, Clear — gap — Delete */}
          <div class={styles.actionsRow} role="group" aria-label="Layer actions">
            <button
              type="button"
              class={styles.actionTile}
              disabled={busy()}
              onClick={() => {
                model().duplicate(layer().id);
                props.onClose();
              }}
            >
              <SketchIcon name="copy" size={16} />
              <span>Dup</span>
            </button>
            <Show when={model().groups}>
              {(groups) => (
                <button
                  type="button"
                  class={styles.actionTile}
                  disabled={busy()}
                  onClick={() => {
                    groups().group([layer().id]);
                    props.onClose();
                  }}
                >
                  <SketchIcon name="folder" size={16} />
                  <span>Group</span>
                </button>
              )}
            </Show>
            <Show
              when={blendOnly() && model().groups?.ungroup}
              fallback={
                <button
                  type="button"
                  class={styles.actionTile}
                  disabled={busy() || !model().canMergeDown(layer().id)}
                  onClick={() => {
                    model().mergeDown(layer().id);
                    props.onClose();
                  }}
                >
                  <SketchIcon name="mergeDown" size={16} />
                  <span>Merge</span>
                </button>
              }
            >
              {(ungroup) => (
                <button
                  type="button"
                  class={styles.actionTile}
                  disabled={busy()}
                  onClick={() => {
                    ungroup()(layer().id);
                    props.onClose();
                  }}
                >
                  <SketchIcon name="folder" size={16} />
                  <span>Ungroup</span>
                </button>
              )}
            </Show>
            <Show when={model().clear}>
              {(clear) => (
                <button type="button" class={styles.actionTile} onClick={() => clear()(layer().id)}>
                  <SketchIcon name="erase" size={16} />
                  <span>Clear</span>
                </button>
              )}
            </Show>
            <span class={styles.actionSpacer} aria-hidden="true" />
            <button
              type="button"
              class={styles.actionTile}
              data-danger=""
              disabled={busy() || !model().canDelete(layer().id)}
              onClick={() => {
                model().delete(layer().id);
                props.onClose();
              }}
            >
              <SketchIcon name="trash" size={16} />
              <span>Delete</span>
            </button>
          </div>

          {/* 6. SettingsRows-style navigation block on the dark plate */}
          <Show when={hasNavigation()}>
            <div class={styles.navList} role="group" aria-label="More layer settings">
              <Show when={hasLocksPage()}>
                <button type="button" class={styles.navRow} aria-label="Open Locks" onClick={() => setPage('locks')}>
                  <span class={styles.navIcon}>
                    <SketchIcon name="lock" size={14} />
                  </span>
                  <span class={styles.navLabel}>Locks</span>
                  <span class={styles.navTrailing}>{locksSummary()}</span>
                  <span class={styles.navChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              </Show>
              <Show when={capabilities().colorTags}>
                <button
                  type="button"
                  class={styles.navRow}
                  aria-label="Open Color tag"
                  onClick={() => setPage('color')}
                >
                  <span class={styles.navIcon}>
                    <SketchIcon name="picker" size={14} />
                  </span>
                  <span class={styles.navLabel}>Color tag</span>
                  <span class={styles.navTrailing}>
                    <Show when={layerColorHex(layer().colorTag)} fallback="None">
                      {(hex) => <span class={styles.navColorDot} style={{ background: hex() }} />}
                    </Show>
                  </span>
                  <span class={styles.navChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              </Show>
              <Show when={capabilities().blendIf}>
                <button
                  type="button"
                  class={styles.navRow}
                  aria-label="Open Blend If"
                  onClick={() => setPage('blendif')}
                >
                  <span class={styles.navIcon}>
                    <SketchIcon name="sliders" size={14} />
                  </span>
                  <span class={styles.navLabel}>Blend If</span>
                  <span class={styles.navTrailing}>{blendIfModified() ? 'Custom' : 'Default'}</span>
                  <span class={styles.navChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* SUBPAGE: BLENDING (the model's modes on the left + vertical Opacity and, where offered, Fill on the right) */}
      <Show when={page() === 'blending'}>
        <div class={styles.subHeader}>
          <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
            ‹ Back
          </button>
          <h3 class={styles.popTitle}>Blending</h3>
        </div>
        <div class={styles.blendingSplit}>
          <div class={styles.blendList} role="listbox" aria-label="Blend modes">
            <Show when={model().favoriteBlends}>
              {(favorites) => (
                <>
                  <p class={styles.sectionLabel}>Favorites</p>
                  <For
                    each={favorites()
                      .modes()
                      .filter((id) => availableModes().some((m) => m.id === id))}
                  >
                    {(modeId) => {
                      const info = () => blendModeInfo(modeId);
                      return (
                        <BlendRow
                          mode={modeId}
                          label={info().label}
                          selected={layer().blend === modeId}
                          favorite={true}
                          onSelect={() => update({ blend: modeId })}
                          onToggleFav={() => favorites().toggle(modeId)}
                        />
                      );
                    }}
                  </For>
                </>
              )}
            </Show>

            <For each={blendModeGroups}>
              {(groupName) => {
                const entries = () => availableModes().filter((mode) => mode.group === groupName);
                return (
                  <Show when={entries().length > 0}>
                    <p class={styles.sectionLabel}>{groupName}</p>
                    <For each={entries()}>
                      {(mode) => (
                        <BlendRow
                          mode={mode.id}
                          label={mode.label}
                          selected={layer().blend === mode.id}
                          favorite={model().favoriteBlends?.modes().includes(mode.id)}
                          onSelect={() => update({ blend: mode.id })}
                          onToggleFav={model().favoriteBlends && (() => model().favoriteBlends?.toggle(mode.id))}
                        />
                      )}
                    </For>
                  </Show>
                );
              }}
            </For>
          </div>

          <div class={styles.verticalSliders}>
            <LegoSlider label="Opacity" value={layer().opacity} vertical onChange={(opacity) => update({ opacity })} />
            <Show when={capabilities().fill}>
              <LegoSlider label="Fill" value={layer().fill} vertical onChange={(fill) => update({ fill })} />
            </Show>
          </div>
        </div>
      </Show>

      {/* SUBPAGE: MASK */}
      <Show when={page() === 'mask' && model().masks && layer().mask ? model().masks : undefined}>
        {(masks) => (
          <div class={styles.popGrid}>
            <div class={styles.subHeader}>
              <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
                ‹ Back
              </button>
              <h3 class={styles.popTitle}>Mask</h3>
            </div>

            <div class={styles.fusedRowTwo} role="group" aria-label="Paint target">
              <button
                type="button"
                class={styles.fusedBtn}
                aria-pressed={!isActiveMask() ? 'true' : 'false'}
                onClick={() => masks().setTarget(layer().id, 'layer')}
              >
                Layer
              </button>
              <button
                type="button"
                class={styles.fusedBtn}
                aria-pressed={isActiveMask() ? 'true' : 'false'}
                onClick={() => masks().setTarget(layer().id, 'mask')}
              >
                Mask
              </button>
            </div>

            <div class={styles.lightToggleGrid}>
              <button
                type="button"
                class={styles.lightToggleTile}
                aria-pressed={layer().mask?.enabled ? 'true' : 'false'}
                onClick={() => masks().toggleEnabled(layer().id)}
              >
                Enabled
              </button>
              <button
                type="button"
                class={styles.lightToggleTile}
                aria-pressed={masks().overlay() ? 'true' : 'false'}
                onClick={() => masks().toggleOverlay()}
              >
                Red overlay
              </button>
            </div>

            <Show when={masks().toggleLinked || (masks().apply && masks().canApply?.(layer().id))}>
              <div class={styles.lightToggleGrid}>
                <Show when={masks().toggleLinked}>
                  {(toggleLinked) => (
                    <button
                      type="button"
                      class={styles.lightToggleTile}
                      aria-pressed={layer().mask?.linked ? 'true' : 'false'}
                      onClick={() => toggleLinked()(layer().id)}
                    >
                      Linked
                    </button>
                  )}
                </Show>
                <Show when={masks().canApply?.(layer().id) ? masks().apply : undefined}>
                  {(apply) => (
                    <button
                      type="button"
                      class={styles.lightToggleTile}
                      onClick={() => {
                        apply()(layer().id);
                        setPage('main');
                      }}
                    >
                      Apply mask
                    </button>
                  )}
                </Show>
              </div>
            </Show>

            <div class={styles.lightToggleGrid}>
              <button
                type="button"
                class={styles.lightToggleTile}
                aria-pressed={layer().mask?.inverted ? 'true' : 'false'}
                onClick={() => masks().invert(layer().id)}
              >
                Invert mask
              </button>
              <button
                type="button"
                class={styles.lightToggleTile}
                data-danger=""
                onClick={() => {
                  masks().remove(layer().id);
                  setPage('main');
                }}
              >
                Delete mask
              </button>
            </div>
          </div>
        )}
      </Show>

      {/* SUBPAGE: LOCKS */}
      <Show when={page() === 'locks'}>
        <div class={styles.popGrid}>
          <div class={styles.subHeader}>
            <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
              ‹ Back
            </button>
            <h3 class={styles.popTitle}>Locks</h3>
          </div>
          <div class={styles.lightToggleGrid}>
            <For each={lockToggles.filter((toggle) => hasLock(toggle.kind))}>
              {(toggle) => (
                <button
                  type="button"
                  class={styles.lightToggleTile}
                  aria-pressed={layer().locks[toggle.kind] ? 'true' : 'false'}
                  onClick={() => update({ locks: lockPatch(toggle.kind, !layer().locks[toggle.kind]) })}
                >
                  {toggle.label}
                </button>
              )}
            </For>
          </div>
          <Show when={capabilities().reference}>
            <button
              type="button"
              class={styles.lightToggleTile}
              aria-pressed={layer().reference ? 'true' : 'false'}
              onClick={() => update({ reference: !layer().reference })}
            >
              Reference layer
            </button>
          </Show>
        </div>
      </Show>

      {/* SUBPAGE: COLOR TAG */}
      <Show when={page() === 'color'}>
        <div class={styles.popGrid}>
          <div class={styles.subHeader}>
            <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
              ‹ Back
            </button>
            <h3 class={styles.popTitle}>Color tag</h3>
          </div>
          <div class={styles.tagTile} role="group" aria-label="Color tag">
            <For each={layerColorTags}>
              {(tag) => (
                <button
                  type="button"
                  class={styles.tagDot}
                  aria-label={`Tag ${tag.label}`}
                  aria-pressed={layer().colorTag === tag.id ? 'true' : 'false'}
                  data-none={tag.hex === undefined ? '' : undefined}
                  style={tag.hex ? { background: tag.hex } : undefined}
                  onClick={() => update({ colorTag: tag.id })}
                />
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* SUBPAGE: BLEND IF */}
      <Show when={page() === 'blendif'}>
        <div class={styles.popGrid}>
          <div class={styles.subHeader}>
            <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
              ‹ Back
            </button>
            <h3 class={styles.popTitle}>Blend If</h3>
            <button type="button" class={styles.popBack} onClick={() => update({ blendIf: defaultBlendIf() })}>
              Reset
            </button>
          </div>
          <p class={styles.popHint}>Tap a handle to split feathering halves; drag any handle across 0–255.</p>
          <BlendIfScale
            title="This Layer"
            range={layer().blendIf.thisLayer}
            onChange={(thisLayer) => update({ blendIf: { ...layer().blendIf, thisLayer } })}
          />
          <BlendIfScale
            title="Underlying"
            range={layer().blendIf.underlying}
            onChange={(underlying) => update({ blendIf: { ...layer().blendIf, underlying } })}
          />
        </div>
      </Show>
    </div>
  );
}

/** A `locks` patch setting the one lock `kind`. */
function lockPatch(kind: LayerLockKind, locked: boolean) {
  const patch: Partial<LayerLocks> = {};
  patch[kind] = locked;
  return patch;
}

/** The Locks page's toggles, in PSD order. */
const lockToggles: readonly { kind: LayerLockKind; label: string }[] = [
  { kind: 'alpha', label: 'Alpha Lock' },
  { kind: 'pixels', label: 'Lock Pixels' },
  { kind: 'position', label: 'Lock Position' },
  { kind: 'all', label: 'Lock All' }
];

/**
 * Native LEGO Paint pointer slider tile (`--lego-track`, `--lego-accent` fill, white thumb, readable value chip).
 * Supports both horizontal (main page `Opacity`) and vertical (`Blending` page `Opacity` & `Fill`) orientations.
 * A drag shows its value as it goes and calls `onChange` once, on release; an arrow key changes it by 5 at once.
 */
function LegoSlider(props: { label: string; value: number; vertical?: boolean; onChange: (next: number) => void }) {
  let trackRef!: HTMLDivElement;
  /** The value under the pointer during a drag, shown instead of `value` until release. */
  const [draft, setDraft] = createSignal<number>();
  const shown = () => draft() ?? props.value;

  const valueAt = (clientX: number, clientY: number) => {
    const rect = trackRef.getBoundingClientRect();
    let fraction: number;
    if (props.vertical) {
      const height = rect.height || 100;
      fraction = 1 - (clientY - rect.top) / height;
    } else {
      const width = rect.width || 100;
      fraction = (clientX - rect.left) / width;
    }

    return Math.max(0, Math.min(100, Math.round(fraction * 100)));
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    const pointer = event.pointerId;
    try {
      trackRef.setPointerCapture(pointer);
    } catch {
      // Unsupported in jsdom.
    }

    let latest = valueAt(event.clientX, event.clientY);
    setDraft(latest);

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) {
        return;
      }

      latest = valueAt(moveEvent.clientX, moveEvent.clientY);
      setDraft(latest);
    };

    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointer) {
        return;
      }

      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
      setDraft(undefined);
      if (endEvent.type === 'pointerup' && latest !== props.value) {
        props.onChange(latest);
      }
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
  };

  return (
    <div
      ref={trackRef}
      class={[styles.legoSlider, props.vertical && styles.legoSliderVertical]}
      role="slider"
      tabindex={0}
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown()}
      aria-orientation={props.vertical ? 'vertical' : 'horizontal'}
      style={{ '--fraction': `${shown()}%` }}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault();
          props.onChange(Math.min(100, props.value + 5));
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault();
          props.onChange(Math.max(0, props.value - 5));
        }
      }}
    >
      <div class={styles.legoSliderFill} />
      <div class={styles.legoSliderThumb} />
      <div class={styles.legoSliderLabel}>
        <span>{props.label}</span>
        <span class={styles.legoSliderChip}>{shown()}%</span>
      </div>
    </div>
  );
}

/** Compact popover for choosing the pinned Paper tone and visibility in native LEGO popup style. */
export function PaperPopover(props: {
  anchor: Element;
  paper: NonNullable<LayersModel['paper']>;
  onClose: () => void;
}) {
  const [element, setElement] = createSignal<HTMLDivElement>();
  const [place, setPlace] = createSignal<{ x: number; y: number }>({ x: 16, y: 16 });

  createEffect(element, (popover) => {
    if (!popover) {
      return;
    }

    const anchorRect = props.anchor.getBoundingClientRect();
    const view = {
      width: Math.max(320, window.innerWidth || 1024),
      height: Math.max(320, window.innerHeight || 768)
    };
    setPlace(
      besideRect(
        {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width || 60,
          height: anchorRect.height || 30
        },
        { width: 220, height: 140 },
        view
      )
    );

    try {
      if (!popover.matches(':popover-open')) {
        popover.showPopover?.();
      }
    } catch {
      // Popover unsupported in jsdom.
    }

    onCleanup(() => {
      try {
        if (popover.matches(':popover-open')) {
          popover.hidePopover?.();
        }
      } catch {
        // Ignore jsdom popover teardown.
      }
    });
  });

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const popover = element();
      if (popover && event.target instanceof Element && !popover.contains(event.target)) {
        props.onClose();
      }
    },
    { capture: true }
  );

  const paper = () => props.paper.state();

  return (
    <div
      ref={setElement}
      class={styles.popover}
      popover="manual"
      role="dialog"
      aria-label="Paper settings"
      data-keeps-panel
      style={{ left: `${place().x}px`, top: `${place().y}px`, width: '220px' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div class={styles.popGrid}>
        <div class={styles.subHeader}>
          <h3 class={styles.popTitle}>Paper</h3>
          <button
            type="button"
            class={styles.popBack}
            aria-pressed={paper().visible ? 'true' : 'false'}
            onClick={() => props.paper.set({ visible: !paper().visible })}
          >
            {paper().visible ? 'Visible' : 'Hidden'}
          </button>
        </div>
        <div class={styles.lightToggleGrid}>
          <For each={paperPresets}>
            {(preset) => (
              <button
                type="button"
                class={styles.lightToggleTile}
                aria-pressed={paper().color === preset.color ? 'true' : 'false'}
                onClick={() => props.paper.set({ color: preset.color, label: preset.label, visible: true })}
              >
                {preset.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

/** One blend mode in the Blending list, with its favourite star where the model keeps favourites. */
function BlendRow(props: {
  mode: PsdBlendMode;
  label: string;
  selected: boolean;
  favorite?: boolean;
  onSelect: () => void;
  onToggleFav?: () => void;
}) {
  return (
    <div class={styles.blendItem}>
      <button
        type="button"
        class={styles.blendSelect}
        role="option"
        aria-selected={props.selected ? 'true' : 'false'}
        onClick={() => props.onSelect()}
      >
        <span>{props.label}</span>
        <span class={styles.popMuted}>{blendModeInfo(props.mode).short}</span>
      </button>
      <Show when={props.onToggleFav}>
        {(toggle) => (
          <button
            type="button"
            class={styles.starBtn}
            aria-label={`Favorite ${props.label}`}
            aria-pressed={props.favorite ? 'true' : 'false'}
            onClick={() => toggle()()}
          >
            {props.favorite ? '★' : '☆'}
          </button>
        )}
      </Show>
    </div>
  );
}

/**
 * Touch-friendly Blend If scale on a light LEGO tile: paired black/white handles split into feathering halves on tap
 * (replacing Photoshop's Alt-drag) and slide smoothly across `0..255`.
 */
function BlendIfScale(props: { title: string; range: BlendIfRange; onChange: (next: BlendIfRange) => void }) {
  let trackRef!: HTMLDivElement;
  const blackSplit = () => props.range[0] !== props.range[1];
  const whiteSplit = () => props.range[2] !== props.range[3];

  const startHandleDrag = (event: PointerEvent, kind: 'black' | 'white', index: 0 | 1 | 2 | 3 | 'pair') => {
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    let moved = false;
    const pointer = event.pointerId;
    const element = event.currentTarget as Element;
    try {
      element.setPointerCapture(pointer);
    } catch {
      // Unsupported in jsdom.
    }

    const toValue = (clientX: number) => {
      const rect = trackRef.getBoundingClientRect();
      const width = rect.width || 255;
      return Math.max(0, Math.min(255, Math.round(((clientX - rect.left) / width) * 255)));
    };

    const move = (nextEvent: PointerEvent) => {
      if (nextEvent.pointerId !== pointer) {
        return;
      }

      if (Math.abs(nextEvent.clientX - startX) >= 5) {
        moved = true;
      }

      if (!moved) {
        return;
      }

      const value = toValue(nextEvent.clientX);
      const [b0, b1, w0, w1] = props.range;
      if (index === 'pair') {
        if (kind === 'black') {
          const clamped = Math.min(w0, value);
          props.onChange([clamped, clamped, w0, w1]);
        } else {
          const clamped = Math.max(b1, value);
          props.onChange([b0, b1, clamped, clamped]);
        }

        return;
      }

      const next: BlendIfRange = [b0, b1, w0, w1];
      if (index === 0) {
        next[0] = Math.min(b1, value);
      } else if (index === 1) {
        next[1] = Math.max(b0, Math.min(w0, value));
      } else if (index === 2) {
        next[2] = Math.max(b1, Math.min(w1, value));
      } else {
        next[3] = Math.max(w0, value);
      }

      props.onChange(next);
    };

    const end = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointer) {
        return;
      }

      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
    };

    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  };

  const splitHandle = (kind: 'black' | 'white') => {
    const [b0, b1, w0, w1] = props.range;
    if (kind === 'black') {
      const low = Math.max(0, b0 - 16);
      const high = Math.min(w0, Math.max(low + 24, b1 + 16));
      props.onChange([low, high, w0, w1]);
      return;
    }

    const high = Math.min(255, w1 + 16);
    const low = Math.max(b1, Math.min(high - 24, w0 - 16));
    props.onChange([b0, b1, low, high]);
  };

  return (
    <div class={styles.blendIfCard}>
      <p class={styles.blendIfTitle}>{props.title}</p>
      <div ref={trackRef} class={styles.blendIfTrack}>
        <Show
          when={blackSplit()}
          fallback={
            <button
              type="button"
              class={styles.blendIfHandle}
              aria-label={`${props.title} black handle`}
              style={{ left: `${(props.range[0] / 255) * 100}%` }}
              onPointerDown={(event) => startHandleDrag(event, 'black', 'pair')}
              onClick={() => splitHandle('black')}
            >
              ◢
            </button>
          }
        >
          <button
            type="button"
            class={styles.blendIfHandle}
            data-split=""
            aria-label={`${props.title} black low`}
            style={{ left: `${(props.range[0] / 255) * 100}%` }}
            onPointerDown={(event) => startHandleDrag(event, 'black', 0)}
          >
            ‹
          </button>
          <button
            type="button"
            class={styles.blendIfHandle}
            data-split=""
            aria-label={`${props.title} black high`}
            style={{ left: `${(props.range[1] / 255) * 100}%` }}
            onPointerDown={(event) => startHandleDrag(event, 'black', 1)}
          >
            ›
          </button>
        </Show>

        <Show
          when={whiteSplit()}
          fallback={
            <button
              type="button"
              class={styles.blendIfHandle}
              data-tone="white"
              aria-label={`${props.title} white handle`}
              style={{ left: `${(props.range[3] / 255) * 100}%` }}
              onPointerDown={(event) => startHandleDrag(event, 'white', 'pair')}
              onClick={() => splitHandle('white')}
            >
              ◣
            </button>
          }
        >
          <button
            type="button"
            class={styles.blendIfHandle}
            data-tone="white"
            data-split=""
            aria-label={`${props.title} white low`}
            style={{ left: `${(props.range[2] / 255) * 100}%` }}
            onPointerDown={(event) => startHandleDrag(event, 'white', 2)}
          >
            ‹
          </button>
          <button
            type="button"
            class={styles.blendIfHandle}
            data-tone="white"
            data-split=""
            aria-label={`${props.title} white high`}
            style={{ left: `${(props.range[3] / 255) * 100}%` }}
            onPointerDown={(event) => startHandleDrag(event, 'white', 3)}
          >
            ›
          </button>
        </Show>
      </div>
      <div class={styles.blendIfReadout} data-blendif-readout={props.title}>
        <span class={styles.blendIfChip}>
          {props.range[0]} / {props.range[1]}
        </span>
        <span class={styles.blendIfChip}>
          {props.range[2]} / {props.range[3]}
        </span>
      </div>
    </div>
  );
}
