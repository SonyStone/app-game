import { NavigationPuck } from '@app-game/navigation-puck';
import { editable } from '@app-game/paint-core/input';
import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, Errored, onCleanup, Show } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import type { PaintTool } from '../../features/brush';
import { createRecentColors } from '../../features/color/createRecentColors';
import {
  createCommandRunner,
  createPaletteContext,
  createTypeAhead,
  describeIntent,
  parseCommand,
  parsedEntry,
  repeatable,
  searchPalette,
  suggestions,
  summarize,
  swatchColors,
  TypeAhead,
  type Intent,
  type Outcome,
  type PaletteEntry
} from '../../features/commands';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { pressHandlers } from '../../shared/ui/pressHandlers';
import { CommandPalette, type RunVia } from './CommandPalette';
import styles from './CommandStudio.module.css';
import { createRecentCommands } from './createRecentCommands';
import { createTwoFingerHold } from './createTwoFingerHold';
import { createVoice } from './createVoice';

/**
 * The Command variant: no buttons. The screen is the drawing, one small button in the top corner away from the pen
 * hand and, until first used, a faint hint. Everything else is typed or said into a command palette after Raycast:
 * `/`, Ctrl/Cmd+K, a tap on the corner button or a two-finger hold opens it; holding the corner button speaks a
 * command where the browser recognizes speech. The palette searches every command of the session (tools, presets,
 * colors, layers, selection, view, symmetry, history, files) and reads parameterized commands such as `size 24`,
 * `layer 3 opacity 40` or `symmetry radial 8` (see `parseCommand`). Opened empty it offers recent and suggested
 * commands, colors and brushes as chips, so a tablet rarely needs the keyboard. A command closes the palette, so that
 * the pen draws next; a tapped repeatable one (undo, a size step, a zoom step) keeps it open. A toast confirms every
 * command. Two- and three-finger taps undo and redo, and a one-finger hold picks a color.
 *
 * With a keyboard, the session's shortcut keys also show what goes with them by the pointer, and other letters type a
 * command right there; see `createTypeAhead`.
 */
export function CommandStudio(props: PaintVariantProps) {
  /** The open palette; `focus` puts the caret in its command line, for a keyboard. */
  const [palette, setPalette] = createSignal<{ focus: boolean }>();
  const session = createPaintSession({ panel: () => (palette() ? 'commands' : undefined) });
  const { library, tools, brush, tool, engine, selection, camera, symmetry, mixer, colorPicker, presets } = session;
  const [query, setQuery] = createSignal('');
  const [hand, setHand] = createStoredChoice(handKey, ['left', 'right'] as const);
  const [used, setUsed] = createStoredChoice(usedKey, ['no', 'yes'] as const);
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const recentColors = createRecentColors();
  const recents = createRecentCommands();
  const toast = createToast();
  let fileInput!: HTMLInputElement;

  const context = createPaletteContext(session, props.experimentsHref !== undefined);
  const runner = createCommandRunner({
    session,
    context,
    ui: {
      pickFile(purpose) {
        fileInput.accept = purpose === 'open' ? '.paint,.psd,application/json,image/vnd.adobe.photoshop' : 'image/*';
        fileInput.dataset.purpose = purpose;
        fileInput.click();
      },
      openAbr() {
        setAbrMounted(true);
        setAbrOpen(true);
      },
      showHelp() {
        if (!palette()) {
          open(true);
        }

        setQuery('help');
      },
      setHand,
      rememberColor: recentColors.remember,
      playground: props.experimentsHref
    }
  });
  const typeAhead = createTypeAhead({
    session,
    run: runner.run,
    onRan(intents, outcomes) {
      if (outcomes.every((outcome) => outcome.ok)) {
        recents.remember(intents);
      }
    },
    context,
    colors: recentColors.colors,
    enabled: () => !palette()
  });
  const voice = createVoice({
    onResult: runSpoken,
    onError: (message) => toast.show({ ok: false, message })
  });
  const entries = createMemo(() => (palette() ? searchPalette(query(), context()) : []));

  session.createShortcuts({
    closePanel() {
      if (!palette()) {
        return false;
      }

      close();
      return true;
    }
  });
  setupOpening();
  // The palette lists the user's presets once it has read them.
  createEffect(
    () => palette() !== undefined,
    (open) => {
      if (open) {
        void library.loadAll();
      }
    }
  );

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage
        session={session}
        input={{
          touchGestures: {
            tap(fingers) {
              if (fingers === 2 || fingers === 3) {
                void execute([{ type: 'history', action: fingers === 2 ? 'undo' : 'redo', count: 1 }], 'gesture');
              }
            },
            // A finger held still picks the color under it, where it lifts.
            hold(point) {
              if (!session.ready() || session.transform.active()) {
                return;
              }

              colorPicker.canvasAction.run(point);
              return { move: colorPicker.canvasAction.move, end: colorPicker.canvasAction.end };
            }
          }
        }}
      >
        <StageGuides session={session} />
        {/* A press outside the open palette only closes it, so the brush cursor would promise a stroke. */}
        <StageOverlays session={session} cursor={!palette()} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div class={styles.ui} data-hand={hand()}>
        <CornerButton
          expanded={palette() !== undefined}
          listening={voice.listening()}
          voice={voice.supported}
          onTap={(focus) => (palette() ? close() : open(focus))}
          onHoldStart={() => {
            open(false);
            voice.start();
          }}
          onHoldEnd={voice.stop}
        />
        <p
          class={styles.hint}
          data-faded={used() === 'yes' || palette() !== undefined ? '' : undefined}
          aria-hidden="true"
        >
          <kbd>/</kbd> to command{voice.supported ? ' · hold to speak' : ''}
        </p>
        <Show when={palette()} keyed>
          {(opened) => (
            <Errored fallback={(error) => <p class={styles.failed}>The command palette failed: {String(error())}</p>}>
              <CommandPalette
                query={query()}
                onQuery={setQuery}
                entries={entries()}
                chips={chips()}
                status={status()}
                autofocus={opened.focus}
                voice={{ supported: voice.supported, listening: voice.listening(), heard: voice.heard() }}
                onVoice={() => (voice.listening() ? voice.stop() : voice.start())}
                onRun={(intents, via) => void execute(intents, via)}
                onClose={close}
                playground={props.experimentsHref}
              />
            </Errored>
          )}
        </Show>
        <Show when={toast.current()} keyed>
          {(current) => (
            <p class={styles.toast} role="status" data-failed={current.ok ? undefined : ''}>
              {current.message}
            </p>
          )}
        </Show>
        <TypeAhead typeAhead={typeAhead} />
        <SessionNotices session={session} />
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (!file) {
            return;
          }

          if (input.dataset.purpose === 'insert') {
            session.images.place(file);
          } else {
            session.edit({ type: 'import', file });
          }
        }}
      />
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

  function open(focus: boolean) {
    typeAhead.close();
    camera.navigation.close();
    setQuery('');
    setPalette({ focus });
    setUsed('yes');
  }

  function close() {
    voice.stop();
    setPalette(undefined);
  }

  /**
   * Runs a palette row, a spoken command or a gesture's undo, remembers it and toasts what happened. Typed commands
   * close the palette; a tap on a repeatable one keeps it open, and help shows in it.
   */
  async function execute(intents: Intent[], via: RunVia | 'voice' | 'gesture', heard?: string) {
    const stays =
      intents.some((intent) => intent.type === 'app' && intent.action === 'help') ||
      (via === 'tap' && intents.every(repeatable));
    if (!stays && via !== 'gesture') {
      close();
    }

    const outcomes = await runner.run(intents);
    if (via !== 'gesture' && outcomes.every((outcome) => outcome.ok)) {
      recents.remember(intents);
    }

    const help = intents.length === 1 && intents[0]!.type === 'app' && intents[0]!.action === 'help';
    if (!help) {
      toast.show(summarize(outcomes, heard));
    }
  }

  /** A spoken command runs when the parser understands it all; otherwise the palette shows what it found. */
  function runSpoken(transcript: string) {
    const intents = parseCommand(transcript, context());
    if (intents) {
      void execute(intents, 'voice', transcript);
      return;
    }

    if (!palette()) {
      open(false);
    }

    setQuery(transcript);
  }

  /** The palette's chips when its line is empty: recent and suggested commands, colors and brushes. */
  function chips() {
    const current = context();
    const state = engine.state();
    const entry = (intents: Intent[]): PaletteEntry => {
      const row = parsedEntry(intents, current);
      const [only] = intents.length === 1 ? intents : [];
      if (only?.type === 'color') {
        return { ...row, swatch: only.hex, current: only.hex === brush().color };
      }

      return only?.type === 'preset' ? { ...row, current: only.id === tools.preset() } : row;
    };
    const exists = (intents: Intent[]) =>
      intents.every((intent) => intent.type !== 'preset' || library.find(intent.id) !== undefined);
    const colors = [
      ...recentColors.colors().map((hex) => ({ name: hex, hex })),
      ...swatchColors.filter((swatch) => !recentColors.colors().includes(swatch.hex))
    ].slice(0, 24);
    const brushes = [tools.preset(), ...session.recentPresets.recent(7)].flatMap((id) => {
      const preset = library.find(id);
      return preset ? [entry([{ type: 'preset', id: preset.id, name: preset.name }])] : [];
    });

    return [
      { title: 'Recent', entries: recents.commands().filter(exists).map(entry) },
      {
        title: 'Suggested',
        entries: suggestions({
          tool: tool(),
          selected: selection.selected(),
          canUndo: state.canUndo,
          canRedo: state.canRedo
        }).map((intent) => entry([intent]))
      },
      {
        title: 'Colors',
        swatches: true,
        entries: colors.map((color) => entry([{ type: 'color', hex: color.hex, name: color.name }]))
      },
      { title: 'Brushes', entries: brushes }
    ];
  }

  /** The palette's state line: tool and preset, size, opacity, color, layer, view, symmetry and the selection. */
  function status() {
    const current = brush();
    const { layers, activeId } = engine.state();
    const layerIndex = layers.findIndex((layer) => layer.id === activeId);
    const view = camera.camera();
    const degrees = Math.round((view.angle * 180) / Math.PI);
    const mode = symmetry.symmetry().mode;
    const toolName = describeIntent(
      tool() === 'lasso'
        ? { type: 'selection-tool', tool: selection.tool() }
        : { type: 'tool', tool: tool() as Exclude<PaintTool, 'lasso'> },
      context()
    );
    const preset = session.paintsWithBrush() ? library.find(tools.preset())?.name : undefined;

    return [
      { value: toolName, unit: preset && ` · ${preset}`, query: 'brush', title: 'Tool and brush' },
      { value: formatSize(current.size), unit: ' px', query: 'size', title: 'Brush size' },
      { value: String(Math.round(current.opacity * 100)), unit: '%', query: 'opacity', title: 'Brush opacity' },
      { value: current.color, swatch: current.color, query: 'colors', title: 'Color' },
      {
        value: layers[layerIndex]?.name ?? '—',
        unit: ` · ${layerIndex + 1}/${layers.length}`,
        query: 'layers',
        title: 'Active layer'
      },
      {
        value: `${Math.round(view.zoom * 100)}%`,
        unit: `${degrees ? ` · ${degrees}°` : ''}${view.mirrored ? ' · mirrored' : ''}`,
        query: 'zoom',
        title: 'View'
      },
      ...(mode === 'off'
        ? []
        : [
            {
              value: 'Symmetry',
              unit: ` · ${symmetryLabel(symmetry.symmetry())}`,
              query: 'symmetry',
              title: 'Symmetry'
            }
          ]),
      ...(selection.selected() ? [{ value: 'Selection', query: 'select', title: 'Selection commands' }] : [])
    ];
  }

  /**
   * Opens the palette from the keyboard (`/`, Ctrl/Cmd+K, `?` for help) and a two-finger hold, and closes it on a
   * press outside it; a press on the drawing then only closes it, without drawing.
   */
  function setupOpening() {
    createEventListener(window, 'keydown', (event) => {
      if (
        event.defaultPrevented ||
        editable(event.target) ||
        (event.target instanceof Element && event.target.closest('dialog[open]'))
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      const toggle = modifier && !event.altKey && event.key.toLowerCase() === 'k';
      const slash = !modifier && !event.altKey && (event.key === '/' || event.key === '?');
      if (!toggle && !slash) {
        return;
      }

      event.preventDefault();
      if (toggle && palette()) {
        close();
        return;
      }

      open(true);
      if (event.key === '?') {
        setQuery('help');
      }
    });

    createEventListener(
      document,
      'pointerdown',
      (event) => {
        const target = event.target;
        if (!palette() || !(target instanceof Element) || target.closest('[data-palette], [data-corner]')) {
          return;
        }

        close();
        if (target instanceof HTMLCanvasElement) {
          event.stopPropagation();
          event.preventDefault();
        }
      },
      { capture: true }
    );

    createTwoFingerHold({
      target: session.stage,
      snapshot: camera.current,
      onHold(view) {
        camera.navigate(view);
        if (!palette()) {
          open(false);
        }
      }
    });
  }
}

/**
 * The only control on the screen: a small button in the top corner away from the pen hand. A tap opens or closes the
 * palette, with the caret in its line for a mouse; a hold of `holdMs` speaks a command until the button is let go,
 * where the browser recognizes speech. Keyboard activation opens the palette too.
 */
function CornerButton(props: {
  expanded: boolean;
  listening: boolean;
  voice: boolean;
  /** `focus`: the press came from a mouse or the keyboard, which can type. */
  onTap: (focus: boolean) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let holding = false;
  const release = () => {
    clearTimeout(timer);
    if (holding) {
      holding = false;
      props.onHoldEnd();
    }
  };
  // Hoisted, so that the press survives the button's other attributes changing; see `pressHandlers`.
  const handlers = pressHandlers({
    start() {
      holding = false;
      if (props.voice) {
        timer = setTimeout(() => {
          holding = true;
          props.onHoldStart();
        }, holdMs);
      }
    },
    tap(press) {
      const held = holding;
      release();
      if (!held) {
        props.onTap(press.pointerType === 'mouse');
      }
    },
    end: release,
    cancel: release
  });

  onCleanup(() => clearTimeout(timer));

  return (
    <button
      class={styles.corner}
      data-corner
      aria-label={props.voice ? 'Commands; hold to speak' : 'Commands'}
      title={props.voice ? 'Commands (/) · hold to speak' : 'Commands (/)'}
      aria-expanded={props.expanded ? 'true' : 'false'}
      data-listening={props.listening ? '' : undefined}
      {...handlers}
      onClick={(event) => {
        // Pointer presses arrive through the handlers; a click without one is the keyboard's.
        if (event.detail === 0) {
          props.onTap(true);
        }
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        <path d="M14.5 7.5l-5 9" />
      </svg>
    </button>
  );
}

/** How long the corner button must be held to speak, in milliseconds. */
const holdMs = 350;

/** The latest toast, cleared after a moment; a new one replaces it. Must be created within a Solid owner. */
function createToast() {
  const [current, setCurrent] = createSignal<Outcome>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(timer));

  return {
    current,
    show(outcome: Outcome) {
      clearTimeout(timer);
      // A new object, so that the same message shown twice appears again.
      setCurrent({ ...outcome });
      timer = setTimeout(() => setCurrent(undefined), outcome.ok ? 1600 : 3200);
    }
  };
}

/** A choice among `values` kept in `localStorage` under `key`, the first value by default. */
function createStoredChoice<const T extends readonly string[]>(key: string, values: T) {
  const read = (): T[number] => {
    try {
      const stored = localStorage.getItem(key);
      return values.includes(stored ?? '') ? (stored as T[number]) : values[0]!;
    } catch {
      return values[0]!;
    }
  };
  const [value, setValue] = createSignal<string>(read());

  return [
    value as () => T[number],
    (next: T[number]) => {
      setValue(() => next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // The choice still applies until the page closes.
      }
    }
  ] as const;
}

const handKey = 'paint.command.hand';
const usedKey = 'paint.command.used';

/** The symmetry mode for the state line, with its segment count where it has one: `radial · 8`. */
function symmetryLabel(settings: PaintSymmetry) {
  const segments = settings.mode === 'radial' || settings.mode === 'mandala' ? settings.segments : undefined;
  return describeIntent({ type: 'symmetry', mode: settings.mode, segments }, { presets: [], layers: [] }).replace(
    /^Symmetry /,
    ''
  );
}

/** A brush size for display: tenths below 10 px, whole pixels above. */
function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}
