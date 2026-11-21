import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { besideRect } from '../board';
import styles from './LayersPrototype.module.css';
import {
  blendModeGroups,
  blendModeInfo,
  defaultBlendIf,
  layerColorTags,
  paperPresets,
  psdBlendModes,
  type BlendIfRange,
  type MockLayerNode,
  type MockLayersService,
  type PsdBlendMode
} from './mockLayers';

type PopoverPage = 'main' | 'blend' | 'blendif';

/**
 * Second-tap layer properties popover anchored beside the tapped tile (left or right, kept inside the viewport).
 * Uses in-place nested pages (`main` → `‹ Blend modes` / `‹ Blend If`) instead of native `<select>` or stacked
 * dialogs, and closes on outside tap or Escape.
 */
export function LayerPropertiesPopover(props: {
  anchor: Element;
  layer: MockLayerNode;
  service: MockLayersService;
  onClose: () => void;
}) {
  const [page, setPage] = createSignal<PopoverPage>('main');
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
    const rect = {
      left: anchorRect.left,
      top: anchorRect.top,
      width: anchorRect.width || 60,
      height: anchorRect.height || 60
    };
    setPlace(besideRect(rect, { width: 296, height: 420 }, view));

    try {
      if (!popover.matches(':popover-open')) {
        popover.showPopover?.();
      }
    } catch {
      // Popover API unsupported in jsdom: element still renders fixed at `place`.
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

  // Dismiss on outside press (canvas tap) in environments without native popover light-dismiss.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const popover = element();
      if (popover && event.target instanceof Node && !popover.contains(event.target)) {
        props.onClose();
      }
    },
    { capture: true }
  );

  createEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (page() !== 'main') {
        setPage('main');
      } else {
        props.onClose();
      }
    }
  });

  const layer = () => props.layer;
  const service = () => props.service;
  const isActiveMask = () => service().activeId() === layer().id && service().target() === 'mask';
  const modeLabel = () => blendModeInfo(layer().blend).label;

  const availableModes = () =>
    psdBlendModes.filter((mode) => (layer().type === 'group' ? true : !mode.groupOnly));

  return (
    <div
      ref={setElement}
      class={styles.popover}
      popover="auto"
      role="dialog"
      aria-label={`Layer properties: ${layer().name}`}
      data-keeps-panel
      style={{ left: `${place().x}px`, top: `${place().y}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onToggle={(event) => {
        const toggleEvent = event as ToggleEvent;
        if (toggleEvent.newState === 'closed') {
          props.onClose();
        }
      }}
    >
      <Show when={page() === 'main'}>
        <div class={styles.popHeader}>
          <input
            type="text"
            class={styles.nameInput}
            aria-label="Layer name"
            value={layer().name}
            onInput={(event) => service().update(layer().id, { name: event.currentTarget.value })}
          />
          <Show when={service().canUndo()}>
            <button type="button" class={styles.popBack} onClick={() => service().undo()}>
              Undo
            </button>
          </Show>
        </div>

        <div class={styles.popStack}>
          <button
            type="button"
            class={styles.popRowBtn}
            aria-label="Open blend modes"
            onClick={() => setPage('blend')}
          >
            <span>Blend mode</span>
            <span class={styles.popMuted}>{modeLabel()} ›</span>
          </button>

          <div class={styles.sliderRow}>
            <div class={styles.sliderHead}>
              <span>Opacity</span>
              <span>{layer().opacity}%</span>
            </div>
            <input
              type="range"
              class={styles.rangeInput}
              aria-label="Opacity"
              min={0}
              max={100}
              value={layer().opacity}
              onInput={(event) => service().update(layer().id, { opacity: Number(event.currentTarget.value) })}
            />
          </div>

          <div class={styles.sliderRow}>
            <div class={styles.sliderHead}>
              <span>Fill</span>
              <span>{layer().fill}%</span>
            </div>
            <input
              type="range"
              class={styles.rangeInput}
              aria-label="Fill"
              min={0}
              max={100}
              value={layer().fill}
              onInput={(event) => service().update(layer().id, { fill: Number(event.currentTarget.value) })}
            />
          </div>

          <div class={styles.toggleRow} role="group" aria-label="Locks and flags">
            <button
              type="button"
              class={styles.togglePill}
              aria-pressed={layer().locks.alpha ? 'true' : 'false'}
              onClick={() => service().update(layer().id, { locks: { alpha: !layer().locks.alpha } })}
            >
              Alpha
            </button>
            <button
              type="button"
              class={styles.togglePill}
              aria-pressed={layer().locks.pixels ? 'true' : 'false'}
              onClick={() => service().update(layer().id, { locks: { pixels: !layer().locks.pixels } })}
            >
              Pixels
            </button>
            <button
              type="button"
              class={styles.togglePill}
              aria-pressed={layer().locks.position ? 'true' : 'false'}
              onClick={() => service().update(layer().id, { locks: { position: !layer().locks.position } })}
            >
              Pos
            </button>
            <button
              type="button"
              class={styles.togglePill}
              aria-pressed={layer().locks.all ? 'true' : 'false'}
              onClick={() => service().update(layer().id, { locks: { all: !layer().locks.all } })}
            >
              All
            </button>
            <button
              type="button"
              class={styles.togglePill}
              aria-pressed={layer().clipping ? 'true' : 'false'}
              onClick={() => service().update(layer().id, { clipping: !layer().clipping })}
            >
              Clip
            </button>
            <button
              type="button"
              class={styles.togglePill}
              aria-pressed={layer().reference ? 'true' : 'false'}
              onClick={() => service().update(layer().id, { reference: !layer().reference })}
            >
              Ref
            </button>
          </div>

          <p class={styles.sectionLabel}>Mask</p>
          <Show
            when={layer().mask}
            fallback={
              <button type="button" class={styles.popRowBtn} onClick={() => service().addMask(layer().id)}>
                <span>Add mask</span>
                <span class={styles.popMuted}>+</span>
              </button>
            }
          >
            {(mask) => (
              <div class={styles.toggleRow}>
                <button
                  type="button"
                  class={styles.togglePill}
                  aria-pressed={!isActiveMask() ? 'true' : 'false'}
                  onClick={() => service().select(layer().id, 'layer')}
                >
                  Layer
                </button>
                <button
                  type="button"
                  class={styles.togglePill}
                  aria-pressed={isActiveMask() ? 'true' : 'false'}
                  onClick={() => service().select(layer().id, 'mask')}
                >
                  Mask
                </button>
                <button
                  type="button"
                  class={styles.togglePill}
                  aria-pressed={service().maskOverlay() ? 'true' : 'false'}
                  onClick={() => service().toggleRubylith()}
                >
                  Red overlay
                </button>
                <button
                  type="button"
                  class={styles.togglePill}
                  onClick={() => service().invertMask(layer().id)}
                >
                  Invert
                </button>
                <button
                  type="button"
                  class={styles.togglePill}
                  aria-pressed={!mask().enabled ? 'true' : 'false'}
                  onClick={() => service().toggleMaskEnabled(layer().id)}
                >
                  {mask().enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  class={styles.togglePill}
                  data-danger=""
                  onClick={() => service().deleteMask(layer().id)}
                >
                  Delete mask
                </button>
              </div>
            )}
          </Show>

          <p class={styles.sectionLabel}>Color tag</p>
          <div class={styles.tagRow} role="group" aria-label="Color tag">
            <For each={layerColorTags}>
              {(tag) => (
                <button
                  type="button"
                  class={styles.tagDot}
                  aria-label={`Tag ${tag.label}`}
                  aria-pressed={layer().colorTag === tag.id ? 'true' : 'false'}
                  data-none={tag.hex === undefined ? '' : undefined}
                  style={tag.hex ? { background: tag.hex } : undefined}
                  onClick={() => service().update(layer().id, { colorTag: tag.id })}
                />
              )}
            </For>
          </div>

          <p class={styles.sectionLabel}>Actions</p>
          <div class={styles.actionsGrid}>
            <button
              type="button"
              class={styles.togglePill}
              onClick={() => {
                service().duplicate(layer().id);
                props.onClose();
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              class={styles.togglePill}
              onClick={() => {
                service().groupLayers([layer().id]);
                props.onClose();
              }}
            >
              Group
            </button>
            <button
              type="button"
              class={styles.togglePill}
              onClick={() => {
                service().mergeDown(layer().id);
                props.onClose();
              }}
            >
              Merge down
            </button>
            <button type="button" class={styles.togglePill} onClick={() => service().clear(layer().id)}>
              Clear
            </button>
            <button
              type="button"
              class={styles.togglePill}
              data-danger=""
              onClick={() => {
                service().delete([layer().id]);
                props.onClose();
              }}
            >
              Delete
            </button>
          </div>

          <button
            type="button"
            class={styles.popRowBtn}
            aria-label="Open Blend If"
            onClick={() => setPage('blendif')}
          >
            <span>Blend If</span>
            <span class={styles.popMuted}>›</span>
          </button>
        </div>
      </Show>

      <Show when={page() === 'blend'}>
        <div class={styles.popHeader}>
          <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
            ‹ Back
          </button>
          <h3 class={styles.popTitle}>Blend modes</h3>
        </div>
        <div class={styles.blendPage}>
          <div class={styles.sliderRow}>
            <div class={styles.sliderHead}>
              <span>Opacity</span>
              <span>{layer().opacity}%</span>
            </div>
            <input
              type="range"
              class={styles.rangeInput}
              aria-label="Blend page opacity"
              min={0}
              max={100}
              value={layer().opacity}
              onInput={(event) => service().update(layer().id, { opacity: Number(event.currentTarget.value) })}
            />
          </div>

          <div class={styles.blendList} role="listbox" aria-label="Blend modes">
            <p class={styles.sectionLabel}>Favorites</p>
            <For each={service().favoriteBlends().filter((id) => availableModes().some((m) => m.id === id))}>
              {(modeId) => {
                const info = () => blendModeInfo(modeId);
                return (
                  <BlendRow
                    mode={modeId}
                    label={info().label}
                    selected={layer().blend === modeId}
                    favorite={true}
                    onSelect={() => service().update(layer().id, { blend: modeId })}
                    onToggleFav={() => service().toggleFavoriteBlend(modeId)}
                  />
                );
              }}
            </For>

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
                          favorite={service().favoriteBlends().includes(mode.id)}
                          onSelect={() => service().update(layer().id, { blend: mode.id })}
                          onToggleFav={() => service().toggleFavoriteBlend(mode.id)}
                        />
                      )}
                    </For>
                  </Show>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      <Show when={page() === 'blendif'}>
        <div class={styles.popHeader}>
          <button type="button" class={styles.popBack} onClick={() => setPage('main')}>
            ‹ Back
          </button>
          <h3 class={styles.popTitle}>Blend If</h3>
          <button
            type="button"
            class={styles.popBack}
            onClick={() => service().update(layer().id, { blendIf: defaultBlendIf() })}
          >
            Reset
          </button>
        </div>
        <div class={styles.popStack}>
          <p class={styles.popMuted} style={{ margin: 0, 'font-size': '11px' }}>
            Tap a handle to split its feathering halves; drag any handle to adjust 0–255.
          </p>
          <BlendIfScale
            title="This Layer"
            range={layer().blendIf.thisLayer}
            onChange={(thisLayer) =>
              service().update(layer().id, { blendIf: { ...layer().blendIf, thisLayer } })
            }
          />
          <BlendIfScale
            title="Underlying"
            range={layer().blendIf.underlying}
            onChange={(underlying) =>
              service().update(layer().id, { blendIf: { ...layer().blendIf, underlying } })
            }
          />
        </div>
      </Show>
    </div>
  );
}

/** Compact popover for choosing the pinned Paper tone and visibility. */
export function PaperPopover(props: {
  anchor: Element;
  service: MockLayersService;
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
  });

  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const popover = element();
      if (popover && event.target instanceof Node && !popover.contains(event.target)) {
        props.onClose();
      }
    },
    { capture: true }
  );

  const paper = () => props.service.paper();

  return (
    <div
      ref={setElement}
      class={styles.popover}
      popover="auto"
      role="dialog"
      aria-label="Paper settings"
      data-keeps-panel
      style={{ left: `${place().x}px`, top: `${place().y}px`, width: '220px' }}
      onPointerDown={(event) => event.stopPropagation()}
      onToggle={(event) => {
        if ((event as ToggleEvent).newState === 'closed') {
          props.onClose();
        }
      }}
    >
      <div class={styles.popStack}>
        <div class={styles.popHeader} style={{ 'margin-bottom': 0 }}>
          <h3 class={styles.popTitle}>Paper</h3>
          <button
            type="button"
            class={styles.togglePill}
            aria-pressed={paper().visible ? 'true' : 'false'}
            onClick={() => props.service.setPaper({ visible: !paper().visible })}
          >
            {paper().visible ? 'Visible' : 'Hidden'}
          </button>
        </div>
        <div class={styles.toggleRow} style={{ 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }}>
          <For each={paperPresets}>
            {(preset) => (
              <button
                type="button"
                class={styles.togglePill}
                aria-pressed={paper().color === preset.color ? 'true' : 'false'}
                onClick={() => props.service.setPaper({ color: preset.color, label: preset.label, visible: true })}
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

function BlendRow(props: {
  mode: PsdBlendMode;
  label: string;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
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
      <button
        type="button"
        class={styles.starBtn}
        aria-label={`Favorite ${props.label}`}
        aria-pressed={props.favorite ? 'true' : 'false'}
        onClick={() => props.onToggleFav()}
      >
        {props.favorite ? '★' : '☆'}
      </button>
    </div>
  );
}

/**
 * Touch-friendly Blend If scale with paired black/white handles that split into feathering halves on tap
 * (replacing Photoshop's Alt-drag) and slide smoothly across `0..255`.
 */
function BlendIfScale(props: {
  title: string;
  range: BlendIfRange;
  onChange: (next: BlendIfRange) => void;
}) {
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
      if (index === 'pair' && kind === 'black') {
        const clamped = Math.min(value, w0);
        props.onChange([clamped, clamped, w0, w1]);
      } else if (index === 'pair' && kind === 'white') {
        const clamped = Math.max(value, b1);
        props.onChange([b0, b1, clamped, clamped]);
      } else if (index === 0) {
        props.onChange([Math.min(value, b1), b1, w0, w1]);
      } else if (index === 1) {
        props.onChange([b0, Math.max(b0, Math.min(value, w0)), w0, w1]);
      } else if (index === 2) {
        props.onChange([b0, b1, Math.max(b1, Math.min(value, w1)), w1]);
      } else if (index === 3) {
        props.onChange([b0, b1, w0, Math.max(w0, value)]);
      }
    };

    const end = (nextEvent: PointerEvent) => {
      if (nextEvent.pointerId !== pointer) {
        return;
      }

      cleanup();
      if (!moved && index === 'pair') {
        splitHandle(kind);
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
    };

    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  };

  /** Splits a paired black or white handle into two feathering halves. */
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
    <div class={styles.blendIfTrackWrap}>
      <p class={styles.sectionLabel}>{props.title}</p>
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
        <span>
          {props.range[0]} / {props.range[1]}
        </span>
        <span>
          {props.range[2]} / {props.range[3]}
        </span>
      </div>
    </div>
  );
}
