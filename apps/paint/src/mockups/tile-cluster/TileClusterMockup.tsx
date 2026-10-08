import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { BrushAdjustHud } from '../../features/brush';
import { ClusterActions } from './clusterActions';
import { createMockCanvas } from './createMockCanvas';
import { createPalmRejection } from './createPalmRejection';
import { createPuckNavigation } from './createPuckNavigation';
import { createDebugOptions } from './debugOptions';
import { DebugSidebar } from './DebugSidebar';
import { createShortcutButton, ShortcutButton } from './Launcher';
import styles from './mockup.module.css';
import { PuckRing } from './PuckRing';
import { RingEditor } from './RingEditor';
import { createRingLayout, inSectorIndex, ringActions, sectorIndexAt, supports, type RingAction } from './ringLayout';
import { ColorTile, LayersTile, PresetsTile, SelectionTile, SettingsTile, ToolsTile, type MockLayer } from './tiles';
import { defaultSettings, presets, toolSections, toolTiles, type SettingValue, type ToolId } from './toolSettings';

/**
 * A working mockup of the tile cluster UI, as `apps/paint/docs/tile-cluster.md` specifies it. The screen shows only
 * the drawing until the cluster opens under the pointer: the Puck ring at its center, the tools on the hand's side,
 * the color above, the settings below, the presets beyond the tools and the layers on the other side.
 *
 * - Invocation: Space while held (or as a toggle, an experiment), the pen's side button and the right mouse button
 *   as toggles, and the shortcut button: a press opens the ring alone, which acts on hover; lifting it without
 *   leaving the dead circle opens the whole cluster as a toggle.
 * - A toggled cluster closes after any action, and the shortcut button shows under the pointer. A held one shows
 *   again after each action, and a press outside it draws, the cluster hidden meanwhile.
 * - Continuous actions (navigating, brush size, picking a value or an option) hide the cluster, except the popup in
 *   use.
 *
 * Brush, mixer and eraser draw; other tools, layers, selection actions and presets beyond their settings only
 * demonstrate their controls. The debug panel switches experiments and shows debug drawing.
 */
export function TileClusterMockup() {
  const paint = createMockCanvas();
  const debug = createDebugOptions();
  const option = <K extends keyof ReturnType<typeof debug.options>>(key: K) => debug.options()[key];
  const ring = createRingLayout();
  const navigation = createPuckNavigation(paint);
  const shortcut = createShortcutButton(debug.options);
  const [editingRing, setEditingRing] = createSignal(false);

  /** The open cluster's placement: the Puck's center and the room around it. */
  const [placement, setPlacement] = createSignal<ReturnType<typeof place>>();
  /** How the open cluster was invoked and whether it is held or toggled; `ringOnly` while a shortcut press shows the ring alone. */
  const [menu, setMenu] = createSignal<Menu>();
  /** A continuous action is in progress, which hides the cluster. */
  const [acting, setActing] = createSignal(false);
  /** A press outside a held cluster draws; the cluster hides until it lifts. */
  const [drawingThrough, setDrawingThrough] = createSignal(false);
  /** The ring press in progress. */
  const [ringPress, setRingPress] = createSignal<RingPress>();
  /** The sector the ring press points at and how strongly it is lit, 0–1. */
  const [heading, setHeading] = createSignal<{ index: number; strength: number }>();
  /** The last run of an instant ring function, counted so that each run flashes anew. */
  const [ringFlash, setRingFlash] = createSignal<{ index: number; count: number }>();
  /** Where the control of the action in progress sits relative to the Puck's center. */
  let actionControl: Point | undefined;
  const [notice, setNotice] = createSignal<string>();

  const dead = () => option('ringDead');
  const outer = () => option('ringDead') + option('ringWidth');

  const clusterActions = {
    begin(control?: Element) {
      beginAction(control);
    },
    end(at?: Point) {
      finishAfterAction(at ?? { x: innerWidth / 2, y: innerHeight / 2 });
    }
  };

  const [tool, setTool] = createSignal<ToolId>('brush');
  const [settings, setSettings] = createSignal(defaultSettings);
  const [preset, setPreset] = createSignal<string>('gouache');
  const [color, setColor] = createSignal('#2d5a7b');
  const [committed, setCommitted] = createSignal('#2d5a7b');
  const [previous, setPrevious] = createSignal('#d9773c');
  const [recent, setRecent] = createSignal<readonly string[]>(initialRecent);
  const [layers, setLayers] = createSignal<readonly MockLayer[]>(initialLayers);
  const [activeLayer, setActiveLayer] = createSignal('ink');

  const tiles = () => toolTiles[tool()];
  const changeSetting = (key: string, value: SettingValue) => {
    setSettings((all) => ({ ...all, [tool()]: { ...all[tool()], [key]: value } }));
    if (['size', 'opacity', 'hardness'].includes(key)) {
      setPreset('');
    }
  };
  const commitColor = () => {
    if (color() !== committed()) {
      setPrevious(committed());
      setCommitted(color());
      setRecent((colors) => [color(), ...colors.filter((entry) => entry !== color())].slice(0, 12));
    }
  };
  const chooseColor = (next: string) => {
    setColor(next);
    commitColor();
  };
  const choosePreset = (id: string) => {
    const chosen = presets.find((entry) => entry.id === id)!;
    const target = tool() === 'eraser' || tool() === 'mixer' ? tool() : 'brush';
    setTool(target);
    setSettings((all) => ({ ...all, [target]: { ...all[target], ...chosen.settings } }));
    setPreset(id);
  };
  /** Sizes for the ring's labels: the zoom, the view's angle and the current tool's brush size. */
  const ringLabels = () => {
    const size = settings()[tool()].size;
    return {
      zoom: `${Math.round(paint.view().scale * 100)}%`,
      roll: `${Math.round(paint.view().angle)}°`,
      ...(typeof size === 'number' ? { brushSize: `${Math.round(size)}px` } : {}),
      ...(settings()[tool()].mixing === 'Clear' ? { clear: 'on' } : {})
    };
  };

  /** Ticks so that the debug panel's pen status shows the age of the last event. */
  const [now, setNow] = createSignal(performance.now());
  const ticker = setInterval(() => setNow(performance.now()), 200);
  onCleanup(() => clearInterval(ticker));
  const penStatus = () => {
    const last = palm.lastPen();
    return last ? `Pen: ${last.type}, ${Math.round(Math.max(0, now() - last.time))} ms ago` : 'Pen: no events yet';
  };

  // Before the other window listeners, so that ignored touches never reach them.
  const palm = createPalmRejection({
    enabled: () => option('palmRejection'),
    hand: () => option('hand'),
    tolerance: () => option('palmTolerance'),
    linger: () => option('palmLinger')
  });
  setupInput();
  createEventListener(window, 'resize', () =>
    setPlacement((current) => current && place(current, { x: 0, y: 0 }, layoutSizes()))
  );

  return (
    <div class={styles.stage}>
      <div
        class={styles.sheet}
        style={{ width: `${paint.sheet.width}px`, height: `${paint.sheet.height}px`, transform: paint.transform() }}
      >
        <canvas ref={paint.bindMain} class={styles.layer} width={paint.sheet.width} height={paint.sheet.height} />
        <canvas
          ref={paint.bindScratch}
          class={styles.layer}
          width={paint.sheet.width}
          height={paint.sheet.height}
          style={{
            opacity: (paint.live()?.opacity ?? 100) / 100,
            filter: paint.live() ? `blur(${paint.softness(paint.live()!)}px)` : 'none'
          }}
        />
      </div>

      <Show when={option('showDebug') && palm.zone()}>
        {(zone) => (
          <div class={styles.palmZone} style={{ left: `${zone().left}px`, width: `${zone().right - zone().left}px` }} />
        )}
      </Show>

      <Show when={placement()}>
        {(where) => (
          <ClusterActions value={clusterActions}>
            <div
              data-cluster-ui
              class={[
                styles.cluster,
                {
                  [styles.mirrored!]: where().mirrored,
                  [styles.hidden!]: (acting() && option('hideDuringActions')) || drawingThrough()
                }
              ]}
              style={{
                left: `${where().x}px`,
                top: `${where().y}px`,
                '--nav': `${outer() * 2}px`,
                '--room-above': `${where().above}px`,
                '--room-below': `${where().below}px`,
                '--room-side': `${where().side}px`
              }}
              onClick={(event) => finishedAction(event)}
            >
              <PuckRing
                class={styles.navSlot}
                layout={ring.layout()}
                inner={dead()}
                outer={outer()}
                heading={heading()?.index}
                strength={heading()?.strength ?? 0}
                flash={ringFlash()}
                labels={ringLabels()}
                shows={(action) => supports(action, tool())}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) {
                    return;
                  }

                  event.preventDefault();
                  (event.currentTarget as Element).setPointerCapture(event.pointerId);
                  beginRing(event, false);
                }}
                onPointerMove={moveRing}
                onPointerUp={endRing}
              />
              <Show when={!menu()?.ringOnly}>
                <ToolsTile
                  class={styles.toolsSlot!}
                  tool={tool()}
                  flipped={paint.view().flipped}
                  onTool={setTool}
                  onFit={paint.fit}
                  onFlip={paint.flip}
                />
                <Show when={tiles().color}>
                  <ColorTile
                    class={styles.colorSlot!}
                    color={color()}
                    previous={previous()}
                    recent={recent()}
                    onChange={setColor}
                    onCommit={commitColor}
                    onChoose={chooseColor}
                  />
                </Show>
                <div class={styles.settingsSlot}>
                  <Show when={tiles().side === 'selection'}>
                    <SelectionTile class={styles.stacked!} />
                  </Show>
                  <SettingsTile
                    class={styles.stacked!}
                    sections={toolSections[tool()]}
                    values={settings()[tool()]}
                    onChange={changeSetting}
                    onPreview={(key, value) =>
                      setSettings((all) => ({ ...all, [tool()]: { ...all[tool()], [key]: value } }))
                    }
                  />
                </div>
                <Show when={tiles().side === 'presets'}>
                  <PresetsTile class={styles.presetsSlot!} preset={preset()} color={color()} onPreset={choosePreset} />
                </Show>
                <LayersTile
                  class={styles.layersSlot!}
                  layers={layers()}
                  active={activeLayer()}
                  onSelect={setActiveLayer}
                  onUpdate={(id, change) =>
                    setLayers((list) => list.map((layer) => (layer.id === id ? { ...layer, ...change } : layer)))
                  }
                  onAction={layerAction}
                />
              </Show>
            </div>
          </ClusterActions>
        )}
      </Show>

      <ShortcutButton
        shortcut={shortcut}
        size={option('launcherSize')}
        reach={option('launcherPlacement')}
        hidden={!!placement() || !!paint.live()}
        pressing={ringPress()?.fromLauncher === true}
        zones={option('showDebug')}
        onPointerDown={pressShortcut}
        onPointerMove={moveRing}
        onPointerUp={releaseShortcut}
      />

      <Show when={ringPress()?.action === 'brushSize' && ringPress()?.anchor}>
        {(anchor) => (
          <BrushAdjustHud
            anchor={anchor()}
            size={(settings()[tool()].size as number | undefined) ?? 0}
            opacity={((settings()[tool()].opacity as number | undefined) ?? 100) / 100}
            color={tool() === 'eraser' || settings()[tool()].mixing === 'Clear' ? '#ffffff' : color()}
            zoom={paint.view().scale}
          />
        )}
      </Show>
      <For each={option('showDebug') ? palm.ignored() : []}>
        {(touch) => <span class={styles.palmMark} style={{ left: `${touch.x}px`, top: `${touch.y}px` }} />}
      </For>
      <Show when={notice()}>{(text) => <div class={styles.notice}>{text()}</div>}</Show>
      <Show when={editingRing()}>
        <RingEditor ring={ring} onClose={() => setEditingRing(false)} />
      </Show>
      <DebugSidebar
        debug={debug}
        status={penStatus()}
        onClear={paint.clear}
        onEditRing={() => {
          close();
          setEditingRing(true);
        }}
      />
    </div>
  );

  /** Opens the cluster with the Puck's center at `point`. */
  function open(point: Point, how: Menu['how'], mode: Menu['mode'], ringOnly = false) {
    const where = place(point, { x: 0, y: 0 }, layoutSizes());
    setActing(false);
    setDrawingThrough(false);
    setMenu({ how, mode, ringOnly });
    setPlacement(where);
    shortcut.hide();
    // Signals written here read stale until the event ends, so callers get the placement directly.
    return where;
  }

  /** Closes the cluster, ending any action; `revealAt` shows the shortcut button there. */
  function close(revealAt?: Point) {
    navigation.end();
    setRingPress(undefined);
    setHeading(undefined);
    setActing(false);
    setDrawingThrough(false);
    setMenu(undefined);
    setPlacement(undefined);
    if (revealAt) {
      shortcut.revealAt(revealAt);
    }
  }

  function beginAction(control?: Element) {
    const where = placement();
    const box = control?.getBoundingClientRect();
    actionControl =
      where && box ? { x: box.left + box.width / 2 - where.x, y: box.top + box.height / 2 - where.y } : undefined;
    setActing(true);
  }

  /**
   * After an action: a held cluster shows again under the pointer (its center, or the action's control); a toggled
   * one closes. Only after navigating (`navigated`) does the shortcut button show under the pointer, as in the addon,
   * so that it can be grabbed again; after choosing a tool, a color or a value the pen goes on drawing there, and the
   * button must not catch its next press.
   */
  function finishAfterAction(at: Point, navigated = false) {
    const current = menu();
    setActing(false);
    if (current?.mode === 'hold' && !current.ringOnly) {
      const under = option('reshowAnchor') === 'same' && actionControl ? actionControl : { x: 0, y: 0 };
      setPlacement(place(at, under, layoutSizes()));
      return;
    }

    close(navigated ? at : undefined);
  }

  /**
   * A finished action by a click in the cluster (a tool, a swatch, a layer, a button) closes a toggled cluster.
   * Buttons that open popups, text fields and the ring report their own actions.
   */
  function finishedAction(event: MouseEvent) {
    const target = event.target as Element;
    if (menu()?.mode !== 'toggle' || target.closest('[aria-haspopup], input, select, [data-ring]')) {
      return;
    }

    close();
  }

  /**
   * A press on the ring. From the shortcut button it acts on hover (drag-select); in the cluster a press on a sector
   * starts its function at once, and a press in the dead circle acts on hover too.
   */
  function beginRing(event: PointerEvent, fromLauncher: boolean, where = placement()) {
    if (!where) {
      return;
    }

    const press: RingPress = { id: event.pointerId, fromLauncher, leftDead: false, used: false };
    setRingPress(press);
    const pointer = point(event);
    const radius = Math.hypot(pointer.x - where.x, pointer.y - where.y);
    if (radius >= dead()) {
      const angle = (Math.atan2(pointer.y - where.y, pointer.x - where.x) * 180) / Math.PI;
      const index = sectorIndexAt(ring.layout(), angle);
      if (shown(index)) {
        enterSector(press, index, pointer, event.shiftKey);
      } else {
        // A press on an empty sector is no tap on the center.
        setRingPress({ ...press, leftDead: true });
      }
    }
  }

  /** A ring press moves: continues its continuous function, or lights and enters the sector it points at. */
  function moveRing(event: PointerEvent) {
    const press = ringPress();
    const where = placement();
    if (press?.id !== event.pointerId || !where) {
      return;
    }

    const pointer = point(event);
    if (press.action) {
      continueAction(press, pointer, event.shiftKey);
      return;
    }

    const away = { x: pointer.x - where.x, y: pointer.y - where.y };
    const radius = Math.hypot(away.x, away.y);
    const angle = (Math.atan2(away.y, away.x) * 180) / Math.PI;
    // A small margin keeps a press that trembles on an instant function from arriving on it twice.
    const stillOn =
      press.on !== undefined &&
      radius >= dead() - stayMargin &&
      radius <= outer() + stayMargin &&
      inSectorIndex(ring.layout(), press.on, angle, stayMarginAngle);
    if (stillOn) {
      setHeading({ index: press.on!, strength: 1 });
      return;
    }

    const index = sectorIndexAt(ring.layout(), angle);
    // Only the ring's buttons act: arriving on one runs it, also from outside the ring. Empty sectors do nothing.
    if (!shown(index)) {
      setHeading(undefined);
      if (press.on !== undefined || radius >= dead()) {
        setRingPress({ ...press, on: undefined, leftDead: press.leftDead || radius >= dead() });
      }

      return;
    }

    if (radius >= dead() && radius <= outer()) {
      setHeading({ index, strength: 1 });
      enterSector(press, index, pointer, event.shiftKey);
      return;
    }

    if (press.on !== undefined) {
      setRingPress({ ...press, on: undefined });
    }

    // From the dead circle only continuous functions light up, more as the press nears the ring; instant ones light
    // only under the pointer.
    const continuous = ringActions[ring.layout().sectors[index]!.action].kind === 'continuous';
    setHeading(
      radius < dead() && radius >= 4 && continuous ? { index, strength: Math.min(1, radius / dead()) } : undefined
    );
  }

  /** The press arrives on sector `index`: a continuous function starts; an instant one runs once. */
  function enterSector(press: RingPress, index: number, pointer: Point, shift: boolean) {
    const action = ring.layout().sectors[index]?.action;
    if (!action) {
      return;
    }

    if (ringActions[action].kind === 'instant') {
      runInstant(action);
      setRingFlash((last) => ({ index, count: (last?.count ?? 0) + 1 }));
      // Undo and Redo keep a toggled cluster open; other functions close it like any action.
      const closes = press.closes || (action !== 'undo' && action !== 'redo');
      setRingPress({ ...press, leftDead: true, on: index, used: true, closes });
      return;
    }

    setHeading(undefined);
    beginAction();
    const size = settings()[tool()].size;
    if (action === 'brushSize') {
      // Paint's brush adjust preview shows the size at the press while the cluster hides.
      setRingPress({
        ...press,
        leftDead: true,
        action,
        startY: pointer.y,
        startSize: typeof size === 'number' ? size : undefined,
        anchor: pointer
      });
      return;
    }

    navigation.start(action as 'pan' | 'zoom' | 'roll', pointer, shift);
    setRingPress({ ...press, leftDead: true, action });
  }

  function continueAction(press: RingPress, pointer: Point, shift: boolean) {
    if (press.action === 'brushSize') {
      if (press.startSize !== undefined && press.startY !== undefined) {
        const size = Math.min(500, Math.max(1, press.startSize * 2 ** ((press.startY - pointer.y) / 80)));
        setSettings((all) => ({ ...all, [tool()]: { ...all[tool()], size: Math.round(size) } }));
      }

      return;
    }

    navigation.move(pointer, shift);
  }

  /** Runs an instant ring function. */
  function runInstant(action: RingAction) {
    if (action === 'undo') {
      paint.undo();
    } else if (action === 'redo') {
      paint.redo();
    } else if (action === 'fit') {
      paint.fit();
    } else if (action === 'flip') {
      paint.flip();
    } else if (action === 'clear') {
      // The same brush and preset, painting transparency: color mixing Clear, or back to Normal.
      changeSetting('mixing', settings()[tool()].mixing === 'Clear' ? 'Normal' : 'Clear');
    }
  }

  /**
   * A ring press lifts. From the shortcut button: lifting without leaving the dead circle opens the whole cluster as
   * a toggle; otherwise the ring closes and the button shows under the pointer. In the cluster a continuous function
   * or an instant one other than Undo and Redo finishes as any action does, and a tap on the center closes a
   * toggled cluster (a held one ignores it).
   */
  function endRing(event: PointerEvent) {
    const press = ringPress();
    if (press?.id !== event.pointerId) {
      return;
    }

    const at = point(event);
    setRingPress(undefined);
    setHeading(undefined);
    if (press.action && press.action !== 'brushSize') {
      navigation.end();
    }

    const navigated = press.action === 'pan' || press.action === 'zoom' || press.action === 'roll';
    if (press.fromLauncher) {
      if (!press.leftDead && !press.used) {
        setMenu({ how: 'launcher', mode: 'toggle', ringOnly: false });
      } else {
        close(navigated ? at : undefined);
      }

      return;
    }

    if (press.action || press.closes) {
      finishAfterAction(at, navigated);
    } else if (!press.leftDead && !press.used && menu()?.mode === 'toggle') {
      // A tap on the Puck's center closes a toggled cluster; a held one stays while its key is held.
      close();
    }
  }

  /** Whether sector `index` holds a function the current tool works with; others are empty. */
  function shown(index: number) {
    const action = ring.layout().sectors[index]?.action;
    return !!action && supports(action, tool());
  }

  /** The sizes the placement keeps in view: the ring, the tools, the columns and the hand's sides. */
  function layoutSizes() {
    return { ring: outer() * 2, mirrored: option('hand') === 'right', autoSwap: option('autoSwap') };
  }

  /**
   * A press on the shortcut button. A mouse or pen press opens the ring alone, centered on the press, acting on
   * hover; a finger only taps it, and its tap opens the whole cluster.
   */
  function pressShortcut(event: PointerEvent) {
    if (event.pointerType === 'touch') {
      setRingPress({ id: event.pointerId, fromLauncher: true, leftDead: false, used: false, touch: true });
      return;
    }

    beginRing(event, true, open(point(event), 'launcher', 'hold', true));
  }

  function releaseShortcut(event: PointerEvent) {
    const press = ringPress();
    if (press?.touch && press.id === event.pointerId) {
      setRingPress(undefined);
      open(shortcut.center(), 'launcher', 'toggle');
      return;
    }

    endRing(event);
  }

  /**
   * Input on the window, in the capture phase so that controls which stop propagation still count: Space, the pen's
   * side button, the right button, presses outside the cluster, drawing and finger navigation. Android Chrome
   * reports a hovering pen's side button only as `pointermove` with zero pressure and nonzero `buttons`.
   */
  function setupInput() {
    let last = { x: innerWidth / 2, y: innerHeight / 2 };
    const hoverButtons = new Map<number, number>();
    const touching = new Set<number>();
    /** Fingers navigating the canvas: one pans, two also zoom and turn around their midpoint. */
    const fingers = new Map<number, Point>();
    /** The press drawing through a held cluster. */
    let throughId: number | undefined;
    const capture = { capture: true };
    /** Whether the event targets the cluster, its popups, the shortcut button, the panel or the editor. */
    const inside = (event: Event) => event.target instanceof Element && !!event.target.closest('[data-cluster-ui]');
    const toggle = (how: Menu['how']) => {
      if (menu()) {
        close();
      } else {
        open(last, how, 'toggle');
      }
    };

    createEventListener(window, 'contextmenu', (event) => event.preventDefault());
    createEventListener(
      window,
      'pointerdown',
      (event) => {
        last = point(event);
        touching.add(event.pointerId);
        hoverButtons.set(event.pointerId, event.buttons);
        if (editingRing()) {
          return;
        }

        if (event.button === 2) {
          event.preventDefault();
          toggle(event.pointerType === 'pen' ? 'pen' : 'mouse');
          return;
        }

        if (inside(event)) {
          return;
        }

        if (event.pointerType === 'touch') {
          // A finger closes a toggled cluster and navigates at once.
          if (menu()?.mode === 'toggle') {
            close();
          }

          fingers.set(event.pointerId, last);
          return;
        }

        const current = menu();
        if (current?.mode === 'toggle') {
          close();
          return;
        }

        if (current) {
          // A press outside a held cluster draws, the cluster hidden until it lifts.
          throughId = event.pointerId;
          setDrawingThrough(true);
        }

        if (tool() !== 'brush' && tool() !== 'mixer' && tool() !== 'eraser') {
          flash('Mockup: only the brush, the mixer and the eraser draw');
          return;
        }

        const values = settings()[tool()];
        paint.begin(event, {
          erase: tool() === 'eraser' || values.mixing === 'Clear',
          color: color(),
          size: values.size as number,
          opacity: values.opacity as number,
          hardness: values.hardness as number,
          pressureSize: values.pressureSize as boolean
        });
      },
      capture
    );
    createEventListener(
      window,
      'pointermove',
      (event) => {
        last = point(event);
        if (event.pointerType !== 'touch' && !ringPress()) {
          shortcut.track(last);
        }

        if (event.pointerType === 'pen' && !touching.has(event.pointerId) && event.pressure === 0) {
          const before = hoverButtons.get(event.pointerId) ?? 0;
          hoverButtons.set(event.pointerId, event.buttons);
          if (before === 0 && event.buttons !== 0 && !editingRing()) {
            toggle('pen');
          }

          return;
        }

        if (fingers.has(event.pointerId)) {
          moveFinger(event.pointerId, last);
          return;
        }

        paint.extend(event);
      },
      capture
    );
    const release = (event: PointerEvent) => {
      touching.delete(event.pointerId);
      hoverButtons.set(event.pointerId, event.buttons);
      fingers.delete(event.pointerId);
      if (throughId === event.pointerId) {
        throughId = undefined;
        setDrawingThrough(false);
      }

      paint.end(event);
    };
    createEventListener(window, 'pointerup', release, capture);
    createEventListener(window, 'pointercancel', release, capture);
    createEventListener(window, 'keydown', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') {
        return;
      }

      if (event.code === 'Space') {
        // Also keeps a focused button from being clicked by Space.
        event.preventDefault();
        if (event.repeat || editingRing()) {
          return;
        }

        if (option('hotkeyMode') === 'toggle') {
          toggle('hotkey');
        } else if (!menu()) {
          open(last, 'hotkey', 'hold');
        } else {
          setMenu({ ...menu()!, how: 'hotkey', mode: 'hold', ringOnly: false });
        }
      } else if (event.key === 'Escape') {
        if (editingRing()) {
          setEditingRing(false);
        } else if (menu()?.mode === 'toggle') {
          close();
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          paint.redo();
        } else {
          paint.undo();
        }
      }
    });
    createEventListener(window, 'keyup', (event) => {
      if (event.code !== 'Space') {
        return;
      }

      event.preventDefault();
      // Releasing a held hotkey cancels the action in progress with the cluster.
      if (option('hotkeyMode') === 'hold' && menu()?.how === 'hotkey' && menu()?.mode === 'hold') {
        close();
      }
    });
    createEventListener(window, 'blur', () => {
      if (menu()?.how === 'hotkey' && menu()?.mode === 'hold') {
        close();
      }
    });

    /**
     * Moves one finger: alone it pans; with another, the pair's midpoint pans and their distance and direction zoom
     * and turn the view around the midpoint.
     */
    function moveFinger(id: number, to: Point) {
      const from = fingers.get(id)!;
      const other = [...fingers.entries()].find(([key]) => key !== id)?.[1];
      fingers.set(id, to);
      if (!other) {
        paint.pan(to.x - from.x, to.y - from.y);
        return;
      }

      const before = { x: (from.x + other.x) / 2, y: (from.y + other.y) / 2 };
      const after = { x: (to.x + other.x) / 2, y: (to.y + other.y) / 2 };
      const spanBefore = Math.hypot(from.x - other.x, from.y - other.y);
      const spanAfter = Math.hypot(to.x - other.x, to.y - other.y);
      const turn =
        ((Math.atan2(to.y - other.y, to.x - other.x) - Math.atan2(from.y - other.y, from.x - other.x)) * 180) / Math.PI;
      paint.gesture(
        before,
        spanBefore > 1 ? spanAfter / spanBefore : 1,
        ((turn + 540) % 360) - 180,
        after.x - before.x,
        after.y - before.y
      );
    }
  }

  /** Shows a short message at the bottom of the screen. */
  function flash(text: string) {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? undefined : current)), 1600);
  }

  function layerAction(action: 'add' | 'duplicate' | 'delete' | 'up' | 'down') {
    const list = [...layers()];
    const index = list.findIndex((layer) => layer.id === activeLayer());
    const layer = list[index];
    if (!layer) {
      return;
    }

    if (action === 'add' || action === 'duplicate') {
      const id = `layer-${Date.now()}`;
      const added =
        action === 'add'
          ? {
              id,
              name: `Layer ${list.length + 1}`,
              visible: true,
              locked: false,
              blend: 'Normal',
              opacity: 100,
              thumb: '#f4f2ee'
            }
          : { ...layer, id, name: `${layer.name} copy` };
      list.splice(index, 0, added);
      setActiveLayer(id);
    } else if (action === 'delete' && list.length > 1) {
      list.splice(index, 1);
      setActiveLayer(list[Math.min(index, list.length - 1)]!.id);
    } else if (action === 'up' && index > 0) {
      [list[index - 1], list[index]] = [layer, list[index - 1]!];
    } else if (action === 'down' && index < list.length - 1) {
      [list[index + 1], list[index]] = [layer, list[index + 1]!];
    }

    setLayers(list);
  }
}

const initialRecent = ['#2d5a7b', '#d9773c', '#1f1f24', '#e8dcc4', '#7a9a6b', '#b8413a', '#f2c14e', '#5b6ea8'];

const initialLayers: readonly MockLayer[] = [
  {
    id: 'light',
    name: 'Highlights',
    visible: true,
    locked: false,
    blend: 'Screen',
    opacity: 60,
    thumb: 'radial-gradient(circle at 70% 30%, #fff6d8, #c9b98f 40%, #f4f2ee 70%)'
  },
  {
    id: 'ink',
    name: 'Ink',
    visible: true,
    locked: false,
    blend: 'Normal',
    opacity: 100,
    thumb: 'repeating-linear-gradient(120deg, #f4f2ee 0 5px, #333 5px 6px)'
  },
  {
    id: 'color',
    name: 'Flat colors',
    visible: true,
    locked: false,
    blend: 'Normal',
    opacity: 100,
    thumb: 'linear-gradient(90deg, #2d5a7b 0 40%, #d9773c 40% 70%, #7a9a6b 70%)'
  },
  {
    id: 'shade',
    name: 'Shadows',
    visible: true,
    locked: false,
    blend: 'Multiply',
    opacity: 70,
    thumb: 'linear-gradient(160deg, #f4f2ee 30%, #8c86a8)'
  },
  {
    id: 'sketch',
    name: 'Sketch',
    visible: false,
    locked: false,
    blend: 'Normal',
    opacity: 40,
    thumb: 'repeating-linear-gradient(45deg, #f4f2ee 0 4px, #9a9a9a 4px 5px)'
  },
  { id: 'paper', name: 'Paper', visible: true, locked: true, blend: 'Normal', opacity: 100, thumb: '#f4f2ee' }
];

/** Gap between tiles and the side columns' width, in CSS pixels; the mockup's CSS uses the same sizes. */
const gap = 6;
const side = 220;
const margin = 8;
/** How far, in CSS pixels and degrees, a press on an instant ring function may stray before it counts as having left. */
const stayMargin = 6;
const stayMarginAngle = 4;

/** The tools tile's width for a ring of diameter `ring`: four squares where the ring's height holds three. */
function toolsWidth(ring: number) {
  const square = (ring - 8 - 6) / 3;
  return square * 4 + 9 + 8;
}

/**
 * Places the cluster so that `under`, a point relative to the Puck's center, lies exactly at `pointer` (only the
 * Puck is kept inside the window). The tools and presets go on the hand's side and the layers on the other, swapped
 * when only that fits and `autoSwap` allows. The height left above, below and beside caps the tiles there, so that
 * they scroll instead.
 */
function place(pointer: Point, under: Point, sizes: { ring: number; mirrored: boolean; autoSwap: boolean }) {
  const half = sizes.ring / 2;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
  const x = clamp(pointer.x - under.x, margin + half, innerWidth - margin - half);
  const y = clamp(pointer.y - under.y, margin + half, innerHeight - margin - half);
  const handSide = half + gap + toolsWidth(sizes.ring) + gap + side;
  const otherSide = half + gap + side;
  const fits = (mirrored: boolean) =>
    x - (mirrored ? otherSide : handSide) >= margin && x + (mirrored ? handSide : otherSide) <= innerWidth - margin;
  const prefer = sizes.mirrored;
  const mirrored = !sizes.autoSwap || fits(prefer) || !fits(!prefer) ? prefer : !prefer;
  return {
    x,
    y,
    mirrored,
    above: y - half - gap - margin,
    below: innerHeight - (y + half + gap) - margin,
    side: innerHeight - (y - half) - margin
  };
}

/**
 * The open cluster: `how` it was invoked, whether it is `hold` (Space held) or `toggle`, and `ringOnly` while a press
 * on the shortcut button shows the ring alone.
 */
type Menu = { how: 'hotkey' | 'pen' | 'mouse' | 'launcher'; mode: 'hold' | 'toggle'; ringOnly: boolean };

/**
 * A press on the ring: from the shortcut button or in the cluster; whether it has left the dead circle; the
 * continuous function it runs (with the brush size and height it started at), or the instant one it is on; whether
 * an instant function ran; and whether it is a finger's tap on the shortcut button.
 */
type RingPress = {
  id: number;
  fromLauncher: boolean;
  leftDead: boolean;
  used: boolean;
  /** An instant function other than Undo and Redo ran, which closes a toggled cluster like any action. */
  closes?: boolean;
  action?: RingAction;
  on?: number | undefined;
  startY?: number;
  startSize?: number | undefined;
  /** Where Brush size started, for its preview. */
  anchor?: Point;
  touch?: boolean;
};

type Point = { x: number; y: number };

function point(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY };
}
