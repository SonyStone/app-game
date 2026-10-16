import { NavigationPuck } from '@app-game/navigation-puck';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, Errored, Match, onCleanup, Show, Switch } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { maxBrushSize } from '../../features/brush';
import { createRecentColors } from '../../features/color/createRecentColors';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageHint,
  StageOverlays
} from '../../features/session';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { ColorDisc, discSize } from './ColorDisc';
import { createPebble } from './createPebble';
import { createRewind } from './createRewind';
import { createZenSettings } from './createZenSettings';
import { Fan } from './Fan';
import { placeSheet, sheetOffset } from './fanLayout';
import { MoreSheet } from './MoreSheet';
import { Pebble } from './Pebble';
import { inwardAngle } from './placement';
import { PresetChooser } from './PresetChooser';
import { RewindRing } from './RewindRing';
import { Sheet } from './Sheet';
import { fanColors } from './tools';
import styles from './ZenStudio.module.css';

/**
 * The Zen variant, after Paper and Tayasui Sketches: the screen is the page, with one pebble on it, a big round button
 * that starts at the free hand's edge. Tapping the pebble fans out a few brushes as tool shapes, the eraser, colors,
 * undo, redo and "more" (layers, export, the mixing palette and pen settings) around it, toward the open space;
 * everything closes as soon as anything touches the drawing. Dragging the pebble moves it: it follows the pen, finger
 * or mouse and stays wherever it is let go, on screen. Holding it still for a moment wakes the brush controls, shown
 * by a preview of the dab; dragging on then sets the brush size (up and down) and opacity (sideways). It slides out of
 * a lingering pen's way and fades while a stroke is drawn.
 *
 * Gestures carry the rest: two fingers tap to undo and three to redo, a held finger picks a color under a loupe,
 * pinch, drag and twist move the view, and one finger circling the pebble rewinds the history like a jog dial (see
 * `createRewind`).
 */
export function ZenStudio(props: PaintVariantProps) {
  const [open, setOpen] = createSignal<Open>();
  const session = createPaintSession({ panel: () => open()?.kind });
  const { library, tools, brush, tool, engine, ready, camera, mixer, colorPicker, presets, images, fullscreen } =
    session;
  const settings = createZenSettings();
  const recentColors = createRecentColors();
  const [ui, setUi] = createSignal<HTMLElement>();
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  /** A word shown in the pebble for a moment after a gesture, such as "Undo". */
  const [flash, setFlash] = createSignal<string>();
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(flashTimer));

  const drawing = createPenContact(session.canvas);
  const pebble = createPebble({
    placement: settings.placement,
    setPlacement: settings.setPlacement,
    view: session.size,
    still: () => open() !== undefined
  });
  const inward = createMemo(() => inwardAngle(pebble.center(), session.size()));
  const rewind = createRewind({
    center: pebble.center,
    canvas: session.canvas,
    enabled: () => !open() && ready() && !drawing() && !session.transform.active() && !session.selection.isBusy(),
    canUndo: () => engine.state().canUndo,
    canRedo: () => engine.state().canRedo,
    undo: session.undo,
    redo: session.redo
  });

  session.createShortcuts({
    closePanel() {
      if (!open()) {
        return false;
      }

      setOpen(undefined);
      return true;
    }
  });

  // Anything touching the drawing closes everything, and goes on to draw or move the view.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (open() && !(event.target instanceof Element && event.target.closest('[data-zen-ui]'))) {
        setOpen(undefined);
      }
    },
    { capture: true }
  );
  // Chrome's touch adjustment would move a finger's press off the pebble and the fan's items onto a nearby button.
  createEffect(ui, (element) => (element ? watchTapTargets(element) : undefined));
  // The fan lists the user's presets once the library has read them.
  createEffect(
    () => open() !== undefined,
    (opened) => {
      if (opened) {
        void library.loadAll();
      }
    }
  );

  /** The fan slot painting now: the active one while the brush tool paints with its preset. */
  const activeSlot = () => {
    const index = settings.active();
    const slot = index === undefined ? undefined : settings.slots()[index];
    return slot && tool() === 'brush' && tools.preset() === slot.preset ? index : undefined;
  };
  const counter = () => {
    const dial = rewind.dial();
    if (dial) {
      return dial.steps === 0 ? '0' : dial.steps > 0 ? `+${dial.steps}` : `−${-dial.steps}`;
    }

    return flash();
  };
  const chooser = () => {
    const current = open();
    return current?.kind === 'chooser' ? current : undefined;
  };
  /** Where the color disc opens: beside the fan's nearest arc, like the sheets. */
  const discAt = () =>
    placeSheet(pebble.center(), inward(), { width: discSize, height: discSize }, session.size(), sheetOffset + 10);

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage
        session={session}
        input={{
          touchGestures: {
            tap(fingers) {
              if (fingers === 2 && engine.state().canUndo) {
                session.undo();
                showFlash('Undo');
              }

              if (fingers === 3 && engine.state().canRedo) {
                session.redo();
                showFlash('Redo');
              }
            },
            // Touch and hold: the eyedropper follows the finger under a loupe and picks the color where it lifts.
            hold(point) {
              if (!ready() || session.transform.active()) {
                return;
              }

              setOpen(undefined);
              colorPicker.canvasAction.run(point);
              return { move: colorPicker.canvasAction.move, end: colorPicker.canvasAction.end };
            }
          }
        }}
      >
        <StageGuides session={session} />
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div ref={setUi} class={styles.ui} data-drawing={drawing() ? '' : undefined}>
        <Show when={ready() && engine.state().tileCount === 0 && !open()}>
          <div class={styles.hint}>
            <StageHint>
              Draw with the pen. Tap the pebble for tools and drag it anywhere; hold it, then drag, for size and
              opacity; circle it with a finger to rewind.
            </StageHint>
          </div>
        </Show>
        <Show when={rewind.dial()}>{(dial) => <RewindRing dial={dial()} />}</Show>
        <Show when={open()}>
          {(current) => (
            <Errored fallback={<p class={styles.failed}>The tools failed to open.</p>}>
              <Fan
                center={pebble.center()}
                inward={inward()}
                view={session.size()}
                quiet={current().kind !== 'fan'}
                slots={settings.slots()}
                active={activeSlot()}
                erasing={tool() === 'eraser'}
                colors={fanColors(brush().color, recentColors.colors(), 7)}
                canUndo={engine.state().canUndo && ready()}
                canRedo={engine.state().canRedo && ready()}
                moreOpen={current().kind === 'more'}
                onUndo={session.undo}
                onRedo={session.redo}
                onMore={() => setOpen(open()?.kind === 'more' ? { kind: 'fan' } : { kind: 'more' })}
                onSlot={(index) => void chooseSlot(index)}
                onSlotHold={(index) => setOpen({ kind: 'chooser', slot: index })}
                onEraser={() => {
                  setOpen(undefined);
                  session.chooseTool('eraser');
                }}
                onColor={(color) => {
                  setOpen(undefined);
                  chooseColor(color);
                }}
                onColorHold={(color) => {
                  chooseColor(color);
                  setOpen({ kind: 'disc' });
                }}
              />
              <Switch>
                <Match when={current().kind === 'more'}>
                  <Sheet
                    center={pebble.center()}
                    inward={inward()}
                    view={session.size()}
                    width={252}
                    label="Layers and export"
                  >
                    <MoreSheet
                      state={engine.state()}
                      ready={ready()}
                      onLayer={(action) => session.edit({ type: 'layer', action })}
                      onExport={(format) => {
                        setOpen(undefined);
                        session.edit({ type: format });
                      }}
                      onOpen={(file) => {
                        setOpen(undefined);
                        session.edit({ type: 'import', file });
                      }}
                      onInsertImage={(file) => {
                        setOpen(undefined);
                        images.place(file);
                      }}
                      onImportBrushes={() => {
                        setOpen(undefined);
                        setAbrMounted(true);
                        setAbrOpen(true);
                      }}
                      hand={settings.hand()}
                      onHand={settings.setHand}
                      paletteOpen={session.windows.isOpen('palette')}
                      onPalette={() => {
                        setOpen(undefined);
                        session.windows.toggle('palette');
                      }}
                      onPen={() => {
                        setOpen(undefined);
                        session.windows.open('pen');
                      }}
                      quickShape={session.quickShape.settings()}
                      onQuickShape={session.quickShape.update}
                      localUndo={session.tool() === 'local-undo'}
                      onLocalUndo={() => {
                        setOpen(undefined);
                        if (session.tool() === 'local-undo') {
                          session.chooseTool(session.tools.slot());
                        } else {
                          session.chooseLocalUndo();
                        }
                      }}
                      fullscreen={{ active: fullscreen.isActive(), supported: document.fullscreenEnabled }}
                      onFullscreen={() => void fullscreen.props.onClick()}
                      experimentsHref={props.experimentsHref}
                    />
                  </Sheet>
                </Match>
                <Match when={chooser()}>
                  {(open) => {
                    const slot = () => settings.slots()[open().slot]!;
                    return (
                      <Sheet
                        center={pebble.center()}
                        inward={inward()}
                        view={session.size()}
                        width={264}
                        label="Brushes"
                      >
                        <PresetChooser
                          shape={slot().shape}
                          presets={library.presets()}
                          current={slot().chosen ? slot().preset : undefined}
                          color={brush().color}
                          resources={library.resources}
                          disabled={!ready() || session.uploads.busy()}
                          onDefault={() => {
                            settings.replaceSlot(open().slot, 'default');
                            void chooseSlot(open().slot);
                          }}
                          onChoose={(preset) => {
                            const index = open().slot;
                            settings.replaceSlot(index, {
                              shape: slot().shape,
                              preset: preset.id,
                              settings: {},
                              chosen: true
                            });
                            void chooseSlot(index);
                          }}
                        />
                      </Sheet>
                    );
                  }}
                </Match>
                <Match when={current().kind === 'disc'}>
                  <div class={styles.discHolder} style={{ left: `${discAt().x}px`, top: `${discAt().y}px` }}>
                    <ColorDisc
                      color={brush().color}
                      onInput={(color) => tools.updateBrush({ color })}
                      onCommit={recentColors.remember}
                    />
                  </div>
                </Match>
              </Switch>
            </Errored>
          )}
        </Show>
        <Errored fallback={null}>
          <Pebble
            center={pebble.center()}
            view={session.size()}
            hand={settings.hand()}
            hidden={drawing()}
            open={open() !== undefined}
            lifted={pebble.carried()}
            brush={brush()}
            erasing={tool() === 'eraser'}
            zoom={camera.camera().zoom}
            maxSize={maxBrushSize(brush())}
            adjustable={session.paintsWithBrush() && session.canChangeBrush() && !session.blockCursor()}
            counter={counter()}
            onTap={() => setOpen(open() ? undefined : { kind: 'fan' })}
            onCarry={(center) => {
              setOpen(undefined);
              pebble.carry(center);
            }}
            onDrop={pebble.drop}
            onAdjust={(patch) => tools.updateBrush(patch)}
            onAdjusted={(patch) => {
              const index = activeSlot();
              if (index !== undefined) {
                settings.updateSlot(index, { settings: patch });
              }
            }}
          />
        </Errored>
        <SessionNotices session={session} />
      </div>
      <Show when={abrMounted()}>
        <AbrViewerDialog
          open={abrOpen()}
          close={() => setAbrOpen(false)}
          mixing={brush().mixing}
          onMixingChange={(mixing) => tools.updateBrush({ mixing })}
          onUseBrush={(asset) => {
            mixer.cancelPick();
            colorPicker.cancel();
            return presets.useBrush(asset);
          }}
        />
      </Show>
    </PaintEditor>
  );

  /** Paints with fan slot `index`: its preset, then its settings over it. Closes the fan. */
  async function chooseSlot(index: number) {
    const slot = settings.slots()[index];
    setOpen(undefined);
    if (!slot) {
      return;
    }

    settings.setActive(index);
    if (tool() !== 'brush') {
      session.chooseTool('brush');
    }

    await session.choosePreset(slot.preset, 'brush');
    tools.updateBrush(slot.settings);
  }

  /** Paints in `color`, remembering it; the eraser gives way to the brush. */
  function chooseColor(color: string) {
    if (tool() === 'eraser') {
      session.chooseTool('brush');
    }

    tools.updateBrush({ color });
    recentColors.remember(color);
  }

  function showFlash(text: string) {
    clearTimeout(flashTimer);
    setFlash(text);
    flashTimer = setTimeout(() => setFlash(undefined), 700);
  }
}

/**
 * Whether a pen or the mouse is pressed on the canvas, drawing or using another tool: the pebble and the hint fade
 * meanwhile. Touches move the view and do not count.
 */
function createPenContact(canvas: () => HTMLCanvasElement | undefined) {
  const [contact, setContact] = createSignal<number>();
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch' && event.button === 0 && event.target === canvas()) {
        setContact(event.pointerId);
      }
    },
    { capture: true, passive: true }
  );
  const lift = (event: PointerEvent) => {
    if (event.pointerId === contact()) {
      setContact(undefined);
    }
  };
  createEventListener(window, 'pointerup', lift, { capture: true, passive: true });
  createEventListener(window, 'pointercancel', lift, { capture: true, passive: true });

  return () => contact() !== undefined;
}

/** What is open around the pebble: the fan alone, or the fan with "more", the color disc or a brush chooser. */
type Open = { kind: 'fan' } | { kind: 'more' } | { kind: 'disc' } | { kind: 'chooser'; slot: number };
