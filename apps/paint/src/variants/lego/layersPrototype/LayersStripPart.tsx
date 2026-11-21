import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import { LayerPropertiesPopover, PaperPopover } from './LayerPropertiesPopover';
import styles from './LayersPrototype.module.css';
import {
  blendModeInfo,
  findNode,
  flattenVisibleTree,
  isEffectivelyVisible,
  layerColorHex,
  nodesAtGroupStack,
  type MockLayerNode,
  type MockLayersService,
  type ReorderZone
} from './mockLayers';

/**
 * Interactive Layers prototype part (`layers:strip`) with two adaptive looks:
 *
 * - `strip` (width < 160 px, 2–3 cells): compact thumbnail tiles, group drill-in (`‹ GroupName`), mask toggle in
 *   the tile's bottom-right corner (or swipe left), and a pinned Paper row at the bottom.
 * - `wide` (width >= 160 px, 4+ cells): indented tree with expand/collapse chevrons and a second mask thumbnail
 *   side by side with the layer thumbnail.
 *
 * Supports second-tap properties popover, long-press eye for Solo, right-swipe multi-select, left-swipe mask toggle,
 * two-finger pinch across tiles to group with undo toast, and Affinity/MOKO drag & drop (pen drags immediately,
 * touch scrolls or lifts on 260 ms hold; auto-enter group on 500 ms hover; auto-exit on `‹ Back` 450 ms hover).
 */
export function LayersStripPart(props: {
  service: MockLayersService;
  wide: boolean;
  /** True only in `live` mode; `edit` and `preview` stay strictly read-only with no timers or popovers. */
  interactive: boolean;
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

  const stripView = createMemo(() => nodesAtGroupStack(props.service.layers(), props.service.groupStack()));
  const wideRows = createMemo(() => flattenVisibleTree(props.service.layers(), props.service.expandedIds()));
  const visibleOrder = createMemo(() =>
    props.wide ? wideRows().map((row) => row.node.id) : stripView().items.map((node) => node.id)
  );
  const popoverLayer = createMemo(() => {
    const open = popover();
    return open ? findNode(props.service.layers(), open.id) : undefined;
  });

  const clearHoverTimers = () => {
    clearTimeout(hoverGroupTimer);
    hoverGroupTimer = undefined;
    hoverGroupId = undefined;
    clearTimeout(hoverBackTimer);
    hoverBackTimer = undefined;
    setBackDropHover(false);
  };

  /** Handles eye pointerdown/up: quick tap toggles visibility; 420 ms hold toggles Solo. */
  const onEyePointerDown = (event: PointerEvent, id: string) => {
    event.stopPropagation();
    if (!props.interactive || event.button !== 0) {
      return;
    }

    eyeSoloFired = false;
    clearTimeout(eyeLongTimer);
    eyeLongTimer = setTimeout(() => {
      eyeSoloFired = true;
      props.service.toggleSolo(id);
    }, 420);
  };

  const onEyePointerUp = (event: PointerEvent) => {
    event.stopPropagation();
    clearTimeout(eyeLongTimer);
  };

  const onEyeClick = (event: MouseEvent, node: MockLayerNode) => {
    event.stopPropagation();
    if (!props.interactive) {
      return;
    }

    if (eyeSoloFired) {
      eyeSoloFired = false;
      return;
    }

    if (props.service.soloId() === node.id) {
      props.service.toggleSolo(node.id);
      return;
    }

    props.service.update(node.id, { visible: !node.visible });
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
    if (activeTouches.size !== 2) {
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
    if (pinchStartDistance - dist >= 24 && !pinchConsumed && range.length >= 2) {
      pinchConsumed = true;
      clearTimeout(touchArmTimer);
      clearTimeout(longPressPropsTimer);
      setArmedId(undefined);
      setDraggingId(undefined);
      setDropTarget(undefined);
      props.service.groupLayers(range);
      setPinchRange(new Set<string>());
      showToast(`Grouped ${range.length} layers`);
      return true;
    }

    return true;
  };

  /** Computes Affinity drop zone from pointer coordinates relative to hovered tile/back row. */
  const updateDragHover = (dragId: string, clientX: number, clientY: number) => {
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(clientX, clientY) : null;
    const backHit = hit?.closest<HTMLElement>('[data-layers-back]');
    if (backHit && !props.wide && props.service.groupStack().length > 0) {
      setDropTarget(undefined);
      setBackDropHover(true);
      clearTimeout(hoverGroupTimer);
      hoverGroupTimer = undefined;
      hoverGroupId = undefined;
      if (!hoverBackTimer) {
        hoverBackTimer = setTimeout(() => {
          hoverBackTimer = undefined;
          setBackDropHover(false);
          props.service.moveOutOfGroup(dragId);
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

    const targetNode = findNode(props.service.layers(), targetId);
    if (!targetNode) {
      setDropTarget(undefined);
      return;
    }

    const rect = tileEl.getBoundingClientRect();
    const relY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
    const relX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;

    let zone: ReorderZone;
    if (relY < 0.28) {
      zone = 'before';
    } else if (relY > 0.72) {
      zone = 'after';
    } else if (targetNode.type === 'group') {
      zone = 'into';
    } else if (relX > 0.68) {
      zone = 'clip';
    } else {
      zone = relY < 0.5 ? 'before' : 'after';
    }

    setDropTarget({ id: targetId, zone });

    if (zone === 'into' && targetNode.type === 'group' && !props.wide) {
      if (hoverGroupId !== targetId) {
        clearTimeout(hoverGroupTimer);
        hoverGroupId = targetId;
        hoverGroupTimer = setTimeout(() => {
          hoverGroupTimer = undefined;
          hoverGroupId = undefined;
          props.service.enterGroup(targetId);
        }, 500);
      }
    } else {
      clearTimeout(hoverGroupTimer);
      hoverGroupTimer = undefined;
      hoverGroupId = undefined;
    }
  };

  /** Selects `node` (preserving mask target when already on its mask) and opens its properties popover. */
  const openPropertiesFor = (node: MockLayerNode, anchor: Element) => {
    const keepMask = props.service.activeId() === node.id && props.service.target() === 'mask' && !!node.mask;
    props.service.select(node.id, keepMask ? 'mask' : 'layer');
    setPopover({ id: node.id, anchor });
  };

  /** Unified gesture handler per tile: tap / follow-selection / second-tap popover, 480ms hold properties, right-click, swipe, pinch, and drag-and-drop. */
  const onTilePointerDown = (event: PointerEvent, node: MockLayerNode) => {
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
    const start = { x: event.clientX, y: event.clientY };

    if (isTouch) {
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

    const beginDrag = () => {
      if (dragging) {
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

    if (!isTouch || activeTouches.size === 1) {
      clearTimeout(longPressPropsTimer);
      longPressPropsTimer = setTimeout(() => {
        if (!moved && !dragging && !swiped && !pinchConsumed && (!isTouch || activeTouches.size === 1)) {
          openedByHold = true;
          setArmedId(undefined);
          openPropertiesFor(node, tileElement);
        }
      }, longPressPropertiesDelay);
    }

    if (isTouch && activeTouches.size === 1) {
      clearTimeout(touchArmTimer);
      touchArmTimer = setTimeout(() => {
        if (!moved && !openedByHold && activeTouches.size === 1) {
          // Arm visually at 220ms without consuming a clean tap; real drag starts only once moved > 10px.
          armed = true;
          setArmedId(node.id);
        }
      }, touchArmDelay);
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) {
        return;
      }

      if (isTouch && activeTouches.has(pointer)) {
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
        swiped = true;
        setArmedId(undefined);
        if (dx > 0) {
          props.service.toggleSelect(node.id);
        } else if (node.mask) {
          const nextTarget =
            props.service.activeId() === node.id && props.service.target() === 'mask' ? 'layer' : 'mask';
          props.service.select(node.id, nextTarget);
        }

        return;
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
      if (isTouch) {
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
          props.service.moveOutOfGroup(node.id);
        } else if (drop) {
          props.service.reorder(node.id, drop.id, drop.zone);
        }

        return;
      }

      if (openedByHold || swiped || moved) {
        return;
      }

      // Clean tap (including 220–479ms touch taps):
      // - While popover is open: tapping another tile follows selection; tapping the anchored tile closes it cleanly.
      // - While popover is closed: first tap selects; second tap on the active tile opens properties.
      const open = popover();
      if (open) {
        if (open.id === node.id) {
          setPopover(undefined);
        } else {
          props.service.select(node.id, 'layer');
          setPopover({ id: node.id, anchor: tileElement });
        }

        return;
      }

      if (props.service.activeId() === node.id) {
        setPopover({ id: node.id, anchor: tileElement });
      } else {
        props.service.select(node.id, 'layer');
      }
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
  const compactBadge = (node: MockLayerNode) => {
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

  const hasAnyLock = (node: MockLayerNode) =>
    node.locks.alpha || node.locks.pixels || node.locks.position || node.locks.all;

  return (
    <div class={styles.stripRoot} data-layers-strip="" data-layers-look={props.wide ? 'wide' : 'strip'}>
      {/* Header: multi-selection bar, mask controls bar (when targeting a mask), or Add layer / Add group */}
      <Show
        when={props.service.selectedIds().length === 0}
        fallback={
          <div class={styles.multiHeader} role="toolbar" aria-label="Selected layers" data-no-edit-long-press="">
            <span class={styles.multiCount}>{props.service.selectedIds().length} sel</span>
            <button
              type="button"
              class={styles.multiBtn}
              onClick={() => {
                if (!props.interactive) {
                  return;
                }

                const count = props.service.selectedIds().length;
                props.service.groupLayers(props.service.selectedIds());
                showToast(`Grouped ${count} layers`);
              }}
            >
              Group
            </button>
            <button
              type="button"
              class={styles.multiBtn}
              onClick={() => {
                if (props.interactive) {
                  props.service.delete(props.service.selectedIds());
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
                  props.service.clearSelection();
                }
              }}
            >
              ✕
            </button>
          </div>
        }
      >
        <Show
          when={props.service.target() === 'mask'}
          fallback={
            <div class={styles.header}>
              <button
                type="button"
                class={styles.headerBtn}
                aria-label="New layer"
                title="New layer"
                onClick={() => {
                  if (props.interactive) {
                    props.service.addLayer();
                  }
                }}
              >
                <SketchIcon name="plus" size={14} />
              </button>
              <button
                type="button"
                class={styles.headerBtn}
                aria-label="New group"
                title="New group"
                onClick={() => {
                  if (props.interactive) {
                    props.service.addGroup();
                  }
                }}
              >
                <SketchIcon name="folder" size={14} />
              </button>
            </div>
          }
        >
          <div class={styles.maskHeader} role="toolbar" aria-label="Mask controls" data-no-edit-long-press="">
            <Show
              when={props.wide}
              fallback={
                <button
                  type="button"
                  class={styles.maskCtrlBtn}
                  data-mask-brush={props.service.maskBrush()}
                  aria-label={
                    props.service.maskBrush() === 'reveal'
                      ? 'Mask brush: Reveal (White). Tap to switch to Hide'
                      : 'Mask brush: Hide (Black). Tap to switch to Reveal'
                  }
                  title={
                    props.service.maskBrush() === 'reveal'
                      ? 'Mask: Reveal (White) — tap for Hide'
                      : 'Mask: Hide (Black) — tap for Reveal'
                  }
                  onClick={() => {
                    if (props.interactive) {
                      props.service.setMaskBrush(props.service.maskBrush() === 'reveal' ? 'hide' : 'reveal');
                    }
                  }}
                >
                  <span class={styles.maskSwatch} data-tone={props.service.maskBrush()} />
                </button>
              }
            >
              <button
                type="button"
                class={styles.maskCtrlBtn}
                aria-pressed={props.service.maskBrush() === 'reveal' ? 'true' : 'false'}
                title="Reveal (White)"
                onClick={() => {
                  if (props.interactive) {
                    props.service.setMaskBrush('reveal');
                  }
                }}
              >
                <span class={styles.maskSwatch} data-tone="reveal" />
                <span>Reveal</span>
              </button>
              <button
                type="button"
                class={styles.maskCtrlBtn}
                aria-pressed={props.service.maskBrush() === 'hide' ? 'true' : 'false'}
                title="Hide (Black)"
                onClick={() => {
                  if (props.interactive) {
                    props.service.setMaskBrush('hide');
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
              aria-pressed={props.service.maskOverlay() ? 'true' : 'false'}
              title="Toggle red Rubylith overlay"
              onClick={() => {
                if (props.interactive) {
                  props.service.toggleRubylith();
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
                  props.service.setTarget('layer');
                }
              }}
            >
              ✕
            </button>
          </div>
        </Show>
      </Show>

      {/* Group breadcrumb back row in narrow strip view */}
      <Show when={!props.wide && stripView().currentGroup} fallback={<div />}>
        {(group) => (
          <button
            type="button"
            class={styles.backRow}
            data-layers-back=""
            data-no-edit-long-press=""
            data-drop-hover={backDropHover() ? '' : undefined}
            aria-label={`Back from ${group().name}`}
            onClick={() => {
              if (props.interactive) {
                props.service.exitGroup();
              }
            }}
          >
            <span>‹</span>
            <span class={styles.backLabel}>{group().name}</span>
          </button>
        )}
      </Show>

      {/* Scrollable layer tiles (strip or wide indented tree) */}
      <div class={styles.scroll} role="list" aria-label="Prototype layers" data-no-edit-long-press="">
        <Show
          when={props.wide}
          fallback={
            <For each={stripView().items} keyed={(node) => node.id}>
              {(item) => {
                const node = () => item();
                const isActive = () => props.service.activeId() === node().id;
                const isMaskTarget = () => isActive() && props.service.target() === 'mask' && !!node().mask;
                const isSelected = () => props.service.selectedIds().includes(node().id);
                const isSolo = () => props.service.soloId() === node().id;
                const visible = () =>
                  isEffectivelyVisible(props.service.layers(), node(), props.service.soloId());
                const tagHex = () => layerColorHex(node().colorTag);
                const dropZone = () => (dropTarget()?.id === node().id ? dropTarget()!.zone : undefined);

                return (
                  <div
                    role="listitem"
                    class={styles.tile}
                    data-layer-tile={node().id}
                    data-no-edit-long-press=""
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
                        <img
                          class={styles.thumbImg}
                          src={isMaskTarget() && node().mask ? node().mask!.thumb : node().thumb}
                          alt=""
                        />
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
                          data-no-edit-long-press=""
                          data-open={popover()?.id === node().id ? '' : undefined}
                          aria-label={`Layer properties for ${node().name}`}
                          title="Layer properties"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!props.interactive) {
                              return;
                            }

                            const tile = event.currentTarget.closest('[data-layer-tile]') ?? event.currentTarget;
                            setPopover((current) => (current?.id === node().id ? undefined : { id: node().id, anchor: tile }));
                          }}
                        >
                          <SketchIcon name="more" size={12} />
                        </button>
                      </Show>

                      <button
                        type="button"
                        class={styles.eyeBtn}
                        data-no-edit-long-press=""
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

                      <Show when={node().type === 'group'}>
                        <button
                          type="button"
                          class={styles.enterGroupBtn}
                          data-no-edit-long-press=""
                          aria-label={`Open group ${node().name}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (props.interactive) {
                              props.service.enterGroup(node().id);
                            }
                          }}
                        >
                          ›
                        </button>
                      </Show>

                      <Show when={node().mask}>
                        {(mask) => (
                          <button
                            type="button"
                            class={styles.maskCorner}
                            data-no-edit-long-press=""
                            data-active={isMaskTarget() ? '' : undefined}
                            data-disabled={!mask().enabled ? '' : undefined}
                            aria-label={`Toggle mask target for ${node().name}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!props.interactive) {
                                return;
                              }

                              props.service.select(node().id, isMaskTarget() ? 'layer' : 'mask');
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
              const isActive = () => props.service.activeId() === node().id;
              const isMaskTarget = () => isActive() && props.service.target() === 'mask' && !!node().mask;
              const isSelected = () => props.service.selectedIds().includes(node().id);
              const isSolo = () => props.service.soloId() === node().id;
              const visible = () =>
                isEffectivelyVisible(props.service.layers(), node(), props.service.soloId());
              const tagHex = () => layerColorHex(node().colorTag);
              const expanded = () => props.service.expandedIds().includes(node().id);
              const dropZone = () => (dropTarget()?.id === node().id ? dropTarget()!.zone : undefined);

              return (
                <div
                  role="listitem"
                  class={styles.wideRow}
                  data-layer-tile={node().id}
                  data-no-edit-long-press=""
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

                  <Show when={node().type === 'group'}>
                    <button
                      type="button"
                      class={styles.expandBtn}
                      data-no-edit-long-press=""
                      aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${node().name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (props.interactive) {
                          props.service.toggleExpand(node().id);
                        }
                      }}
                    >
                      {expanded() ? '▾' : '▸'}
                    </button>
                  </Show>

                  <button
                    type="button"
                    class={styles.wideThumbBtn}
                    data-no-edit-long-press=""
                    data-target={isActive() && !isMaskTarget() ? '' : undefined}
                    aria-label={`Select layer ${node().name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!props.interactive) {
                        return;
                      }

                      const tile = event.currentTarget.closest('[data-layer-tile]') ?? event.currentTarget;
                      const open = popover();
                      if (open) {
                        if (open.id === node().id) {
                          setPopover(undefined);
                        } else {
                          props.service.select(node().id, 'layer');
                          setPopover({ id: node().id, anchor: tile });
                        }

                        return;
                      }

                      if (props.service.activeId() === node().id && props.service.target() === 'layer') {
                        setPopover({ id: node().id, anchor: tile });
                      } else {
                        props.service.select(node().id, 'layer');
                      }
                    }}
                  >
                    <Show when={node().type !== 'group'} fallback={<SketchIcon name="folder" size={16} />}>
                      <img src={node().thumb} alt="" />
                    </Show>
                  </button>

                  <Show when={node().mask}>
                    {(mask) => (
                      <button
                        type="button"
                        class={styles.wideThumbBtn}
                        data-no-edit-long-press=""
                        data-mask-target={isMaskTarget() ? '' : undefined}
                        data-disabled={!mask().enabled ? '' : undefined}
                        aria-label={`Select mask for ${node().name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (props.interactive) {
                            props.service.select(node().id, 'mask');
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
                      data-no-edit-long-press=""
                      data-open={popover()?.id === node().id ? '' : undefined}
                      aria-label={`Layer properties for ${node().name}`}
                      title="Layer properties"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!props.interactive) {
                          return;
                        }

                        const tile = event.currentTarget.closest('[data-layer-tile]') ?? event.currentTarget;
                        setPopover((current) => (current?.id === node().id ? undefined : { id: node().id, anchor: tile }));
                      }}
                    >
                      <SketchIcon name="more" size={14} />
                    </button>
                  </Show>

                  <button
                    type="button"
                    class={styles.wideEyeBtn}
                    data-no-edit-long-press=""
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
      <button
        type="button"
        class={styles.paperBtn}
        data-hidden={!props.service.paper().visible ? '' : undefined}
        aria-label="Paper settings"
        onClick={(event) => {
          if (!props.interactive) {
            return;
          }

          setPaperAnchor((current) => (current ? undefined : event.currentTarget));
        }}
      >
        <span class={styles.paperChip} style={{ background: props.service.paper().color }} />
        <span>{props.wide ? `Paper · ${props.service.paper().label}` : 'Paper'}</span>
      </button>

      {/* Pinch-to-group toast with Undo */}
      <Show when={toast()}>
        {(message) => (
          <div class={styles.toast} role="status">
            <span>{message()}</span>
            <Show when={props.service.canUndo()}>
              <button
                type="button"
                onClick={() => {
                  props.service.undo();
                  setToast(undefined);
                }}
              >
                Undo
              </button>
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
            service={props.service}
            onClose={() => setPopover(undefined)}
          />
        )}
      </Show>

      {/* Paper tone/visibility popover */}
      <Show when={props.interactive && paperAnchor()}>
        {(anchor) => (
          <PaperPopover anchor={anchor()} service={props.service} onClose={() => setPaperAnchor(undefined)} />
        )}
      </Show>
    </div>
  );
}

/** Distance in CSS pixels separating a clean tap from drag/swipe on glass tablet displays. */
const gestureThreshold = 10;

/** Touch hold milliseconds before a tile visually arms for drag without cancelling a tap. */
const touchArmDelay = 220;

/** Still hold milliseconds on a tile before opening Layer Properties directly. */
const longPressPropertiesDelay = 480;
