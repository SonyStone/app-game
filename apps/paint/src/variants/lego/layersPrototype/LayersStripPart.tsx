import { createMemo, createSignal, For, onCleanup, onSettled, Show } from 'solid-js';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import { LayerPropertiesPopover, PaperPopover } from './LayerPropertiesPopover';
import {
  blendModeInfo,
  findNode,
  flattenVisibleTree,
  isEffectivelyVisible,
  layerColorHex,
  nodesAtGroupStack,
  type LayerNode,
  type LayersModel,
  type ReorderZone
} from './layersModel';
import styles from './LayersPrototype.module.css';

/**
 * The layers strip (`layers:strip` over the drawing, `layers:strip-prototype` over the PSD-like prototype) with two
 * adaptive looks:
 *
 * - `strip` (width < 160 px, 2–3 cells): compact thumbnail tiles, group drill-in (`‹ GroupName`), mask toggle in
 *   the tile's bottom-right corner (or swipe left), and a pinned Paper row at the bottom.
 * - `wide` (width >= 160 px, 4+ cells): indented tree with expand/collapse chevrons and a second mask thumbnail
 *   side by side with the layer thumbnail.
 *
 * Tap selects; a second tap, `⋯`, a 480 ms hold, right-click or the pen's side button opens the properties popover.
 * Drag reorders (pen and mouse after 10 px, touch after a 220 ms hold). Where `model` offers them: long press on the
 * eye for Solo, right swipe for multi-select, left swipe for the mask, two-finger pinch across tiles to group with an
 * undo toast, drop into groups (auto-enter on 500 ms hover, auto-exit on `‹ Back` 450 ms hover) and clip drops. A
 * gesture or control whose feature `model` does not offer is absent. Structural commands wait for `model.ready()`.
 *
 * Thumbnails are asked for (`model.wantThumbnails`) only while `acquireThumbnails`, which a part sets outside its
 * catalog preview.
 */
export function LayersStripPart(props: {
  model: LayersModel;
  wide: boolean;
  /** True only in `live` mode; `edit` and `preview` stay strictly read-only with no timers or popovers. */
  interactive: boolean;
  /** Asks the model for thumbnails while mounted; false in catalog previews. */
  acquireThumbnails?: boolean;
}) {
  const [popover, setPopover] = createSignal<{ id: string; anchor: Element }>();
  const [paperAnchor, setPaperAnchor] = createSignal<Element>();
  const [toast, setToast] = createSignal<string>();
  const [armedId, setArmedId] = createSignal<string>();
  const [draggingId, setDraggingId] = createSignal<string>();
  const [dropTarget, setDropTarget] = createSignal<{ id: string; zone: ReorderZone }>();
  const [backDropHover, setBackDropHover] = createSignal(false);
  const [pinchRange, setPinchRange] = createSignal<ReadonlySet<string>>(new Set());

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let eyeLongTimer: ReturnType<typeof setTimeout> | undefined;
  let eyeSoloFired = false;
  let hoverGroupTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverGroupId: string | undefined;
  let hoverBackTimer: ReturnType<typeof setTimeout> | undefined;
  let touchArmTimer: ReturnType<typeof setTimeout> | undefined;
  let longPressPropsTimer: ReturnType<typeof setTimeout> | undefined;

  /** Active touch pointers on tiles, tracked for two-finger pinch-to-group. */
  const activeTouches = new Map<number, { layerId: string; x: number; y: number }>();
  let pinchStartDistance: number | undefined;
  let pinchConsumed = false;

  onCleanup(() => {
    clearTimeout(toastTimer);
    clearTimeout(eyeLongTimer);
    clearTimeout(hoverGroupTimer);
    clearTimeout(hoverBackTimer);
    clearTimeout(touchArmTimer);
    clearTimeout(longPressPropsTimer);
  });

  const showToast = (message: string) => {
    clearTimeout(toastTimer);
    setToast(message);
    toastTimer = setTimeout(() => setToast(undefined), 3000);
  };

  /** Structural commands (add, reorder, group, delete) run only live and once the model accepts them. */
  const structural = () => props.interactive && props.model.ready();
  const target = () => props.model.masks?.target() ?? 'layer';
  const soloId = () => props.model.solo?.id();
  const selectedIds = () => props.model.selection?.ids() ?? [];
  const stripView = createMemo(() => nodesAtGroupStack(props.model.layers(), props.model.groups?.stack() ?? []));
  const wideRows = createMemo(() => flattenVisibleTree(props.model.layers(), props.model.groups?.expandedIds() ?? []));
  const visibleOrder = createMemo(() =>
    props.wide ? wideRows().map((row) => row.node.id) : stripView().items.map((node) => node.id)
  );
  const popoverLayer = createMemo(() => {
    const open = popover();
    return open ? findNode(props.model.layers(), open.id) : undefined;
  });

  const clearHoverTimers = () => {
    clearTimeout(hoverGroupTimer);
    hoverGroupTimer = undefined;
    hoverGroupId = undefined;
    clearTimeout(hoverBackTimer);
    hoverBackTimer = undefined;
    setBackDropHover(false);
  };

  /** Handles eye pointerdown/up: quick tap toggles visibility; 420 ms hold toggles Solo where the model has it. */
  const onEyePointerDown = (event: PointerEvent, id: string) => {
    event.stopPropagation();
    const solo = props.model.solo;
    if (!props.interactive || event.button !== 0 || !solo) {
      return;
    }

    eyeSoloFired = false;
    clearTimeout(eyeLongTimer);
    eyeLongTimer = setTimeout(() => {
      eyeSoloFired = true;
      solo.toggle(id);
    }, 420);
  };

  const onEyePointerUp = (event: PointerEvent) => {
    event.stopPropagation();
    clearTimeout(eyeLongTimer);
  };

  const onEyeClick = (event: MouseEvent, node: LayerNode) => {
    event.stopPropagation();
    if (!props.interactive) {
      return;
    }

    if (eyeSoloFired) {
      eyeSoloFired = false;
      return;
    }

    const solo = props.model.solo;
    if (solo && solo.id() === node.id) {
      solo.toggle(node.id);
      return;
    }

    props.model.update(node.id, { visible: !node.visible });
  };

  /** Computes pinch range between the two touched tiles in visual order. */
  const idsBetween = (a: string, b: string) => {
    const order = visibleOrder();
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    if (indexA < 0 || indexB < 0) {
      return [];
    }

    const start = Math.min(indexA, indexB);
    const end = Math.max(indexA, indexB);
    return order.slice(start, end + 1);
  };

  /** Evaluates two-finger pinch across two different tiles to group the spanned range. */
  const checkPinch = () => {
    const groups = props.model.groups;
    if (!groups || activeTouches.size !== 2) {
      pinchStartDistance = undefined;
      setPinchRange(new Set<string>());
      return false;
    }

    const [first, second] = [...activeTouches.values()];
    if (!first || !second || first.layerId === second.layerId) {
      return false;
    }

    const dist = Math.hypot(first.x - second.x, first.y - second.y);
    if (pinchStartDistance === undefined) {
      pinchStartDistance = dist;
      setPinchRange(new Set(idsBetween(first.layerId, second.layerId)));
      return true;
    }

    const range = idsBetween(first.layerId, second.layerId);
    setPinchRange(new Set(range));
    if (pinchStartDistance - dist >= 24 && !pinchConsumed && range.length >= 2 && structural()) {
      pinchConsumed = true;
      clearTimeout(touchArmTimer);
      clearTimeout(longPressPropsTimer);
      setArmedId(undefined);
      setDraggingId(undefined);
      setDropTarget(undefined);
      groups.group(range);
      setPinchRange(new Set<string>());
      showToast(`Grouped ${range.length} layers`);
      return true;
    }

    return true;
  };

  /**
   * The drop zone under the pointer: the top and bottom bands, the right of a layer (clipped onto it), the right of a
   * group when its folders can be clipping bases (`groups.blendOnly`), and the middle of a group. A group dragged in a
   * model whose folders cannot be clipped has no clip zone.
   */
  const zoneAt = (node: LayerNode, relX: number, relY: number, dragged: LayerNode | undefined): ReorderZone => {
    const zones = props.model.capabilities.dropZones;
    const folderBases = !!props.model.groups?.blendOnly;
    if (relY < 0.28) {
      return 'before';
    }

    if (relY > 0.72) {
      return 'after';
    }

    const clips = zones.includes('clip') && !(folderBases && dragged?.type === 'group');
    if (clips && relX > 0.68 && (node.type !== 'group' || folderBases)) {
      return 'clip';
    }

    if (node.type === 'group' && zones.includes('into')) {
      return 'into';
    }

    return relY < 0.5 ? 'before' : 'after';
  };

  /** Computes the drop zone from pointer coordinates relative to the hovered tile or back row. */
  const updateDragHover = (dragId: string, clientX: number, clientY: number) => {
    const groups = props.model.groups;
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(clientX, clientY) : null;
    const backHit = hit?.closest<HTMLElement>('[data-layers-back]');
    if (backHit && groups && !props.wide && groups.stack().length > 0) {
      setDropTarget(undefined);
      setBackDropHover(true);
      clearTimeout(hoverGroupTimer);
      hoverGroupTimer = undefined;
      hoverGroupId = undefined;
      if (!hoverBackTimer) {
        hoverBackTimer = setTimeout(() => {
          hoverBackTimer = undefined;
          setBackDropHover(false);
          groups.moveOut(dragId);
        }, 450);
      }

      return;
    }

    clearTimeout(hoverBackTimer);
    hoverBackTimer = undefined;
    setBackDropHover(false);

    const tileEl = hit?.closest<HTMLElement>('[data-layer-tile]');
    const targetId = tileEl?.dataset.layerTile;
    if (!tileEl || !targetId || targetId === dragId) {
      setDropTarget(undefined);
      clearTimeout(hoverGroupTimer);
      hoverGroupTimer = undefined;
      hoverGroupId = undefined;
      return;
    }

    const targetNode = findNode(props.model.layers(), targetId);
    if (!targetNode) {
      setDropTarget(undefined);
      return;
    }

    const rect = tileEl.getBoundingClientRect();
    const relY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
    const relX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const zone = zoneAt(targetNode, relX, relY, findNode(props.model.layers(), dragId));
    setDropTarget({ id: targetId, zone });

    if (zone === 'into' && groups && !props.wide) {
      if (hoverGroupId !== targetId) {
        clearTimeout(hoverGroupTimer);
        hoverGroupId = targetId;
        hoverGroupTimer = setTimeout(() => {
          hoverGroupTimer = undefined;
          hoverGroupId = undefined;
          groups.enter(targetId);
        }, 500);
      }
    } else {
      clearTimeout(hoverGroupTimer);
      hoverGroupTimer = undefined;
      hoverGroupId = undefined;
    }
  };

  /** Selects `node` (keeping its mask as the target when already painting it) and opens its properties popover. */
  const openPropertiesFor = (node: LayerNode, anchor: Element) => {
    const keepMask = props.model.activeId() === node.id && target() === 'mask' && !!node.mask;
    if (!keepMask) {
      props.model.select(node.id);
    }

    setPopover({ id: node.id, anchor });
  };

  /** Toggles the popover anchored to the tile around `button`. */
  const togglePopoverFrom = (button: Element, node: LayerNode) => {
    const tile = button.closest('[data-layer-tile]') ?? button;
    setPopover((current) => (current?.id === node.id ? undefined : { id: node.id, anchor: tile }));
  };

  /**
   * Tap on a tile: follows selection while the popover is open, otherwise selects, and a second tap opens it. In the
   * wide tree the thumbnail selects the pixels, so a tap there while painting the mask goes back to the pixels.
   */
  const tapTile = (node: LayerNode, tile: Element, pixels = false) => {
    const open = popover();
    if (open) {
      if (open.id === node.id) {
        setPopover(undefined);
      } else {
        props.model.select(node.id);
        setPopover({ id: node.id, anchor: tile });
      }

      return;
    }

    if (props.model.activeId() === node.id && (!pixels || target() === 'layer')) {
      setPopover({ id: node.id, anchor: tile });
    } else {
      props.model.select(node.id);
    }
  };

  /** Unified gesture handler per tile: tap / follow-selection / second-tap popover, 480ms hold properties, right-click, swipe, pinch, and drag-and-drop. */
  const onTilePointerDown = (event: PointerEvent, node: LayerNode) => {
    if (!props.interactive) {
      return;
    }

    const tileElement = event.currentTarget as HTMLElement;
    // Secondary button / pen side button opens properties immediately.
    if (event.button === 2) {
      event.preventDefault();
      openPropertiesFor(node, tileElement);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const pointer = event.pointerId;
    const isTouch = event.pointerType === 'touch';
    const pinchable = isTouch && !!props.model.groups;
    const start = { x: event.clientX, y: event.clientY };

    if (pinchable) {
      activeTouches.set(pointer, { layerId: node.id, x: start.x, y: start.y });
      if (activeTouches.size === 2) {
        clearTimeout(touchArmTimer);
        clearTimeout(longPressPropsTimer);
        setArmedId(undefined);
        pinchConsumed = false;
        checkPinch();
      }
    }

    let armed = false;
    let dragging = false;
    let swiped = false;
    let moved = false;
    let openedByHold = false;
    const alone = () => !pinchable || activeTouches.size === 1;

    const beginDrag = () => {
      if (dragging || !structural()) {
        return;
      }

      dragging = true;
      clearTimeout(longPressPropsTimer);
      setArmedId(undefined);
      setDraggingId(node.id);
      try {
        tileElement.setPointerCapture(pointer);
      } catch {
        // Unsupported in jsdom or synthetic events.
      }
    };

    if (alone()) {
      clearTimeout(longPressPropsTimer);
      longPressPropsTimer = setTimeout(() => {
        if (!moved && !dragging && !swiped && !pinchConsumed && alone()) {
          openedByHold = true;
          setArmedId(undefined);
          openPropertiesFor(node, tileElement);
        }
      }, longPressPropertiesDelay);
    }

    if (isTouch && alone() && structural()) {
      clearTimeout(touchArmTimer);
      touchArmTimer = setTimeout(() => {
        if (!moved && !openedByHold && alone()) {
          // Arm visually at 220ms without consuming a clean tap; real drag starts only once moved > 10px.
          armed = true;
          setArmedId(node.id);
        }
      }, touchArmDelay);
    }

    /** The swipe action for a horizontal swipe by `dx`, if the model offers one. */
    const swipeAction = (dx: number) => {
      const selection = props.model.selection;
      const masks = props.model.masks;
      if (dx > 0) {
        return selection && (() => selection.toggle(node.id));
      }

      if (masks && node.mask) {
        return () =>
          masks.setTarget(node.id, props.model.activeId() === node.id && masks.target() === 'mask' ? 'layer' : 'mask');
      }

      return undefined;
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) {
        return;
      }

      if (pinchable && activeTouches.has(pointer)) {
        activeTouches.set(pointer, { layerId: node.id, x: moveEvent.clientX, y: moveEvent.clientY });
        if (activeTouches.size >= 2) {
          checkPinch();
          return;
        }
      }

      if (pinchConsumed || openedByHold) {
        return;
      }

      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= gestureThreshold) {
        moved = true;
        clearTimeout(longPressPropsTimer);
        if (!armed && !dragging) {
          clearTimeout(touchArmTimer);
        }
      }

      if (!dragging && !swiped && Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        const action = swipeAction(dx);
        if (action) {
          swiped = true;
          setArmedId(undefined);
          action();
          return;
        }
      }

      // Touch drag begins only after 220ms arm AND > 10px move; pen/mouse drags after 10px vertical/diagonal move.
      if (isTouch && armed && !dragging && !swiped && dist >= gestureThreshold) {
        beginDrag();
      } else if (!isTouch && !dragging && !swiped && dist >= gestureThreshold && Math.abs(dy) >= Math.abs(dx) * 0.75) {
        beginDrag();
      }

      if (dragging) {
        updateDragHover(node.id, moveEvent.clientX, moveEvent.clientY);
      }
    };

    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointer) {
        return;
      }

      cleanup();
      setArmedId(undefined);
      if (pinchable) {
        activeTouches.delete(pointer);
        if (activeTouches.size === 0) {
          pinchStartDistance = undefined;
          setPinchRange(new Set<string>());
          if (pinchConsumed) {
            pinchConsumed = false;
            return;
          }
        }
      }

      if (dragging) {
        const drop = dropTarget();
        const overBack = backDropHover();
        clearHoverTimers();
        setDraggingId(undefined);
        setDropTarget(undefined);
        if (overBack) {
          props.model.groups?.moveOut(node.id);
        } else if (drop && structural()) {
          props.model.reorder(node.id, drop.id, drop.zone);
        }

        return;
      }

      if (openedByHold || swiped || moved) {
        return;
      }

      // Clean tap, including 220–479ms touch taps.
      tapTile(node, tileElement);
    };

    const cleanup = () => {
      clearTimeout(touchArmTimer);
      clearTimeout(longPressPropsTimer);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
  };

  /** Compact mode/opacity badge text shown on narrow strip tiles when not Normal 100%. */
  const compactBadge = (node: LayerNode) => {
    const mode = blendModeInfo(node.blend);
    const defaultMode = node.type === 'group' ? node.blend === 'pass-through' : node.blend === 'normal';
    const showMode = !defaultMode;
    const showOpacity = node.opacity < 100;
    if (!showMode && !showOpacity) {
      return undefined;
    }

    if (showMode && showOpacity) {
      return `${mode.short} ${node.opacity}%`;
    }

    return showMode ? mode.short : `${node.opacity}%`;
  };

  const hasAnyLock = (node: LayerNode) =>
    node.locks.alpha || node.locks.pixels || node.locks.position || node.locks.all;

  return (
    <div class={styles.stripRoot} data-layers-strip="" data-layers-look={props.wide ? 'wide' : 'strip'}>
      <Show when={props.acquireThumbnails && props.model.wantThumbnails}>
        <WantThumbnails model={props.model} />
      </Show>

      {/* Header: multi-selection bar, mask controls bar (when targeting a mask), or Add layer / Add group */}
      <Show
        when={props.model.selection && selectedIds().length > 0 ? props.model.selection : undefined}
        fallback={
          <Show
            when={target() === 'mask' ? props.model.masks : undefined}
            fallback={
              <div class={styles.header}>
                <button
                  type="button"
                  class={styles.headerBtn}
                  aria-label="New layer"
                  title="New layer"
                  disabled={!props.model.ready()}
                  onClick={() => {
                    if (structural()) {
                      props.model.addLayer();
                    }
                  }}
                >
                  <SketchIcon name="plus" size={14} />
                </button>
                <Show when={props.model.groups}>
                  {(groups) => (
                    <button
                      type="button"
                      class={styles.headerBtn}
                      aria-label="New group"
                      title="New group"
                      disabled={!props.model.ready()}
                      onClick={() => {
                        if (structural()) {
                          groups().add();
                        }
                      }}
                    >
                      <SketchIcon name="folder" size={14} />
                    </button>
                  )}
                </Show>
              </div>
            }
          >
            {(masks) => (
              <div class={styles.maskHeader} role="toolbar" aria-label="Mask controls">
                <Show
                  when={props.wide}
                  fallback={
                    <button
                      type="button"
                      class={styles.maskCtrlBtn}
                      data-mask-brush={masks().brush()}
                      aria-label={
                        masks().brush() === 'reveal'
                          ? 'Mask brush: Reveal (White). Tap to switch to Hide'
                          : 'Mask brush: Hide (Black). Tap to switch to Reveal'
                      }
                      title={
                        masks().brush() === 'reveal'
                          ? 'Mask: Reveal (White) — tap for Hide'
                          : 'Mask: Hide (Black) — tap for Reveal'
                      }
                      onClick={() => {
                        if (props.interactive) {
                          masks().setBrush(masks().brush() === 'reveal' ? 'hide' : 'reveal');
                        }
                      }}
                    >
                      <span class={styles.maskSwatch} data-tone={masks().brush()} />
                    </button>
                  }
                >
                  <button
                    type="button"
                    class={styles.maskCtrlBtn}
                    aria-pressed={masks().brush() === 'reveal' ? 'true' : 'false'}
                    title="Reveal (White)"
                    onClick={() => {
                      if (props.interactive) {
                        masks().setBrush('reveal');
                      }
                    }}
                  >
                    <span class={styles.maskSwatch} data-tone="reveal" />
                    <span>Reveal</span>
                  </button>
                  <button
                    type="button"
                    class={styles.maskCtrlBtn}
                    aria-pressed={masks().brush() === 'hide' ? 'true' : 'false'}
                    title="Hide (Black)"
                    onClick={() => {
                      if (props.interactive) {
                        masks().setBrush('hide');
                      }
                    }}
                  >
                    <span class={styles.maskSwatch} data-tone="hide" />
                    <span>Hide</span>
                  </button>
                </Show>
                <button
                  type="button"
                  class={styles.maskCtrlBtn}
                  data-ruby=""
                  aria-label="Red mask overlay"
                  aria-pressed={masks().overlay() ? 'true' : 'false'}
                  title="Toggle red Rubylith overlay"
                  onClick={() => {
                    if (props.interactive) {
                      masks().toggleOverlay();
                    }
                  }}
                >
                  <span class={styles.maskRedDot} />
                  <Show when={props.wide}>
                    <span>Red</span>
                  </Show>
                </button>
                <button
                  type="button"
                  class={styles.maskCtrlBtn}
                  data-exit=""
                  aria-label="Exit mask mode"
                  title="Back to layer"
                  onClick={() => {
                    if (props.interactive) {
                      masks().exit();
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </Show>
        }
      >
        {(selection) => (
          <div class={styles.multiHeader} role="toolbar" aria-label="Selected layers">
            <span class={styles.multiCount}>{selectedIds().length} sel</span>
            <Show when={props.model.groups}>
              {(groups) => (
                <button
                  type="button"
                  class={styles.multiBtn}
                  disabled={!props.model.ready()}
                  onClick={() => {
                    if (!structural()) {
                      return;
                    }

                    const ids = selectedIds();
                    groups().group(ids);
                    showToast(`Grouped ${ids.length} layers`);
                  }}
                >
                  Group
                </button>
              )}
            </Show>
            <button
              type="button"
              class={styles.multiBtn}
              disabled={!props.model.ready()}
              onClick={() => {
                if (structural()) {
                  selection().delete(selectedIds());
                }
              }}
            >
              Del
            </button>
            <button
              type="button"
              class={styles.multiBtn}
              aria-label="Clear selection"
              onClick={() => {
                if (props.interactive) {
                  selection().clear();
                }
              }}
            >
              ✕
            </button>
          </div>
        )}
      </Show>

      {/* Group breadcrumb back row in narrow strip view */}
      <Show when={!props.wide && props.model.groups ? stripView().currentGroup : undefined} fallback={<div />}>
        {(group) => (
          <button
            type="button"
            class={styles.backRow}
            data-layers-back=""
            data-drop-hover={backDropHover() ? '' : undefined}
            aria-label={`Back from ${group().name}`}
            onClick={() => {
              if (props.interactive) {
                props.model.groups?.exit();
              }
            }}
          >
            <span>‹</span>
            <span class={styles.backLabel}>{group().name}</span>
          </button>
        )}
      </Show>

      {/* Scrollable layer tiles (strip or wide indented tree) */}
      <div class={styles.scroll} role="list" aria-label="Layers">
        <Show
          when={props.wide}
          fallback={
            <For each={stripView().items} keyed={(node) => node.id}>
              {(item) => {
                const node = () => item();
                const isActive = () => props.model.activeId() === node().id;
                const isMaskTarget = () => isActive() && target() === 'mask' && !!node().mask;
                const isSelected = () => selectedIds().includes(node().id);
                const isSolo = () => soloId() === node().id;
                const visible = () => isEffectivelyVisible(props.model.layers(), node(), soloId());
                const tagHex = () => layerColorHex(node().colorTag);
                const dropZone = () => (dropTarget()?.id === node().id ? dropTarget()!.zone : undefined);
                const thumb = () => (isMaskTarget() ? node().mask?.thumb : node().thumb);

                return (
                  <div
                    role="listitem"
                    class={styles.tile}
                    data-layer-tile={node().id}
                    data-active={isActive() && !isMaskTarget() ? '' : undefined}
                    data-mask-active={isMaskTarget() ? '' : undefined}
                    data-open={popover()?.id === node().id ? '' : undefined}
                    data-armed={armedId() === node().id ? '' : undefined}
                    data-selected={isSelected() ? '' : undefined}
                    data-pinch={pinchRange().has(node().id) ? '' : undefined}
                    data-hidden={!visible() ? '' : undefined}
                    data-clipping={node().clipping ? '' : undefined}
                    data-dragging={draggingId() === node().id ? '' : undefined}
                    data-drop={dropZone()}
                    aria-label={node().name}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (props.interactive && !draggingId()) {
                        openPropertiesFor(node(), event.currentTarget);
                      }
                    }}
                    onPointerDown={(event) => onTilePointerDown(event, node())}
                  >
                    <Show when={node().clipping}>
                      <span class={styles.clipArrow} aria-hidden="true">
                        ↳
                      </span>
                    </Show>

                    <div class={styles.thumbWrap}>
                      <Show
                        when={node().type !== 'group'}
                        fallback={
                          <div class={styles.groupStack}>
                            <SketchIcon name="folder" size={20} />
                            <span class={styles.groupCount}>{node().children?.length ?? 0}</span>
                          </div>
                        }
                      >
                        <Show
                          when={thumb()}
                          fallback={
                            <span class={styles.thumbEmpty} aria-hidden="true">
                              <SketchIcon name="paper" size={20} />
                            </span>
                          }
                        >
                          {(src) => <img class={styles.thumbImg} src={src()} alt="" draggable={false} />}
                        </Show>
                      </Show>

                      <Show when={tagHex()}>
                        {(hex) => (
                          <span
                            class={styles.colorDot}
                            data-strip-dot=""
                            data-shifted={isActive() ? '' : undefined}
                            style={{ background: hex() }}
                          />
                        )}
                      </Show>

                      <Show when={isActive()}>
                        <button
                          type="button"
                          class={styles.propsBtn}
                          data-open={popover()?.id === node().id ? '' : undefined}
                          aria-label={`Layer properties for ${node().name}`}
                          title="Layer properties"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (props.interactive) {
                              togglePopoverFrom(event.currentTarget, node());
                            }
                          }}
                        >
                          <SketchIcon name="more" size={12} />
                        </button>
                      </Show>

                      <button
                        type="button"
                        class={styles.eyeBtn}
                        data-solo={isSolo() ? '' : undefined}
                        aria-label={`Toggle visibility for ${node().name}`}
                        onPointerDown={(event) => onEyePointerDown(event, node().id)}
                        onPointerUp={onEyePointerUp}
                        onClick={(event) => onEyeClick(event, node())}
                      >
                        <SketchIcon name={visible() ? 'eye' : 'hidden'} size={12} />
                      </button>

                      <div class={styles.badgeRow}>
                        <Show when={isMaskTarget()}>
                          <span class={styles.maskBadge}>MASK</span>
                        </Show>
                        <Show when={compactBadge(node())}>
                          {(text) => <span class={styles.modeBadge}>{text()}</span>}
                        </Show>
                        <Show when={node().reference}>
                          <span class={styles.refBadge}>Ref</span>
                        </Show>
                        <Show when={hasAnyLock(node())}>
                          <span class={styles.lockBadge} aria-label="Locked">
                            <SketchIcon name="lock" size={9} />
                          </span>
                        </Show>
                      </div>

                      <Show when={node().type === 'group' ? props.model.groups : undefined}>
                        {(groups) => (
                          <button
                            type="button"
                            class={styles.enterGroupBtn}
                            aria-label={`Open group ${node().name}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (props.interactive) {
                                groups().enter(node().id);
                              }
                            }}
                          >
                            ›
                          </button>
                        )}
                      </Show>

                      <Show when={props.model.masks && node().mask}>
                        {(mask) => (
                          <button
                            type="button"
                            class={styles.maskCorner}
                            data-active={isMaskTarget() ? '' : undefined}
                            data-disabled={!mask().enabled ? '' : undefined}
                            aria-label={`Toggle mask target for ${node().name}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (props.interactive) {
                                props.model.masks?.setTarget(node().id, isMaskTarget() ? 'layer' : 'mask');
                              }
                            }}
                          >
                            <img src={mask().thumb} alt="" />
                          </button>
                        )}
                      </Show>

                      <Show when={dropZone() === 'clip'}>
                        <span class={styles.clipDropHint}>↳ Clip</span>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          }
        >
          {/* Wide indented tree with side-by-side layer + mask thumbnails */}
          <For each={wideRows()} keyed={(row) => row.node.id}>
            {(entry) => {
              const node = () => entry().node;
              const depth = () => entry().depth;
              const isActive = () => props.model.activeId() === node().id;
              const isMaskTarget = () => isActive() && target() === 'mask' && !!node().mask;
              const isSelected = () => selectedIds().includes(node().id);
              const isSolo = () => soloId() === node().id;
              const visible = () => isEffectivelyVisible(props.model.layers(), node(), soloId());
              const tagHex = () => layerColorHex(node().colorTag);
              const expanded = () => props.model.groups?.expandedIds().includes(node().id) ?? false;
              const dropZone = () => (dropTarget()?.id === node().id ? dropTarget()!.zone : undefined);

              return (
                <div
                  role="listitem"
                  class={styles.wideRow}
                  data-layer-tile={node().id}
                  data-depth={depth()}
                  data-active={isActive() && !isMaskTarget() ? '' : undefined}
                  data-mask-active={isMaskTarget() ? '' : undefined}
                  data-open={popover()?.id === node().id ? '' : undefined}
                  data-armed={armedId() === node().id ? '' : undefined}
                  data-selected={isSelected() ? '' : undefined}
                  data-pinch={pinchRange().has(node().id) ? '' : undefined}
                  data-hidden={!visible() ? '' : undefined}
                  data-dragging={draggingId() === node().id ? '' : undefined}
                  data-drop={dropZone()}
                  aria-label={node().name}
                  style={{ 'padding-left': `${6 + depth() * 14 + (node().clipping ? 12 : 0)}px` }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (props.interactive && !draggingId()) {
                      openPropertiesFor(node(), event.currentTarget);
                    }
                  }}
                  onPointerDown={(event) => onTilePointerDown(event, node())}
                >
                  <Show when={depth() > 0}>
                    <span class={styles.indentGuide} style={{ left: `${depth() * 14}px` }} />
                  </Show>
                  <Show when={node().clipping}>
                    <span class={styles.wideClipArrow} aria-hidden="true">
                      ↳
                    </span>
                  </Show>

                  <Show when={node().type === 'group' ? props.model.groups : undefined}>
                    {(groups) => (
                      <button
                        type="button"
                        class={styles.expandBtn}
                        aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${node().name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (props.interactive) {
                            groups().toggleExpand(node().id);
                          }
                        }}
                      >
                        {expanded() ? '▾' : '▸'}
                      </button>
                    )}
                  </Show>

                  <button
                    type="button"
                    class={styles.wideThumbBtn}
                    data-target={isActive() && !isMaskTarget() ? '' : undefined}
                    aria-label={`Select layer ${node().name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (props.interactive) {
                        tapTile(node(), event.currentTarget.closest('[data-layer-tile]') ?? event.currentTarget, true);
                      }
                    }}
                  >
                    <Show when={node().type !== 'group'} fallback={<SketchIcon name="folder" size={16} />}>
                      <Show when={node().thumb} fallback={<SketchIcon name="paper" size={16} />}>
                        {(src) => <img src={src()} alt="" draggable={false} />}
                      </Show>
                    </Show>
                  </button>

                  <Show when={props.model.masks && node().mask}>
                    {(mask) => (
                      <button
                        type="button"
                        class={styles.wideThumbBtn}
                        data-mask-target={isMaskTarget() ? '' : undefined}
                        data-disabled={!mask().enabled ? '' : undefined}
                        aria-label={`Select mask for ${node().name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (props.interactive) {
                            props.model.masks?.setTarget(node().id, 'mask');
                          }
                        }}
                      >
                        <img src={mask().thumb} alt="" />
                      </button>
                    )}
                  </Show>

                  <div class={styles.wideInfo}>
                    <div class={styles.wideNameRow}>
                      <Show when={tagHex()}>
                        {(hex) => <span class={styles.colorDot} style={{ background: hex() }} />}
                      </Show>
                      <span class={styles.wideName}>{node().name}</span>
                    </div>
                    <span class={styles.wideSub}>
                      <span>
                        {blendModeInfo(node().blend).label} · {node().opacity}%
                      </span>
                      <Show when={node().reference}>
                        <span class={styles.refBadge}>Ref</span>
                      </Show>
                      <Show when={hasAnyLock(node())}>
                        <SketchIcon name="lock" size={10} />
                      </Show>
                    </span>
                  </div>

                  <Show when={isActive()}>
                    <button
                      type="button"
                      class={styles.widePropsBtn}
                      data-open={popover()?.id === node().id ? '' : undefined}
                      aria-label={`Layer properties for ${node().name}`}
                      title="Layer properties"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (props.interactive) {
                          togglePopoverFrom(event.currentTarget, node());
                        }
                      }}
                    >
                      <SketchIcon name="more" size={14} />
                    </button>
                  </Show>

                  <button
                    type="button"
                    class={styles.wideEyeBtn}
                    data-solo={isSolo() ? '' : undefined}
                    aria-label={`Toggle visibility for ${node().name}`}
                    onPointerDown={(event) => onEyePointerDown(event, node().id)}
                    onPointerUp={onEyePointerUp}
                    onClick={(event) => onEyeClick(event, node())}
                  >
                    <SketchIcon name={visible() ? 'eye' : 'hidden'} size={14} />
                  </button>

                  <Show when={dropZone() === 'clip'}>
                    <span class={styles.clipDropHint}>↳ Clip</span>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Pinned Paper row */}
      <Show when={props.model.paper}>
        {(paper) => (
          <button
            type="button"
            class={styles.paperBtn}
            data-hidden={!paper().state().visible ? '' : undefined}
            aria-label="Paper settings"
            onClick={(event) => {
              if (props.interactive) {
                setPaperAnchor((current) => (current ? undefined : event.currentTarget));
              }
            }}
          >
            <span class={styles.paperChip} style={{ background: paper().state().color }} />
            <span>{props.wide ? `Paper · ${paper().state().label}` : 'Paper'}</span>
          </button>
        )}
      </Show>

      {/* Pinch-to-group toast, with Undo where the model keeps an undo of its own */}
      <Show when={toast()}>
        {(message) => (
          <div class={styles.toast} role="status">
            <span>{message()}</span>
            <Show when={props.model.localUndo?.canUndo() ? props.model.localUndo : undefined}>
              {(undo) => (
                <button
                  type="button"
                  onClick={() => {
                    undo().undo();
                    setToast(undefined);
                  }}
                >
                  Undo
                </button>
              )}
            </Show>
          </div>
        )}
      </Show>

      {/* Second-tap properties popover */}
      <Show when={props.interactive && popover() && popoverLayer()}>
        {(layer) => (
          <LayerPropertiesPopover
            anchor={popover()!.anchor}
            layer={layer()}
            model={props.model}
            onClose={() => setPopover(undefined)}
          />
        )}
      </Show>

      {/* Paper tone/visibility popover */}
      <Show when={props.interactive && props.model.paper && paperAnchor()}>
        {(anchor) => (
          <PaperPopover anchor={anchor()} paper={props.model.paper!} onClose={() => setPaperAnchor(undefined)} />
        )}
      </Show>
    </div>
  );
}

/** Thumbnail demand lives under the mounted strip's owner, released when it unmounts or turns into a preview. */
function WantThumbnails(props: { model: LayersModel }) {
  onSettled(() => props.model.wantThumbnails?.(stripThumbnailSize));
  return undefined;
}

/** CSS pixels on the longer side a strip tile shows its thumbnail at. */
const stripThumbnailSize = 64;

/** Distance in CSS pixels separating a clean tap from drag/swipe on glass tablet displays. */
const gestureThreshold = 10;

/** Touch hold milliseconds before a tile visually arms for drag without cancelling a tap. */
const touchArmDelay = 220;

/** Still hold milliseconds on a tile before opening Layer Properties directly. */
const longPressPropertiesDelay = 480;
