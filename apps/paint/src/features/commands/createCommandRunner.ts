import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createMemo, latest } from 'solid-js';
import { maxBrushSize } from '../brush';
import type { PaintSession } from '../session';
import type { PaletteContext } from './catalog';
import { describeIntent, type CommandContext, type Intent } from './commands';

/** What running a command did, in a few words for the toast; `ok` is false when it could not run. */
export type Outcome = { ok: boolean; message: string };

/**
 * Runs palette intents on the drawing session. Each intent checks what it needs first (a selection for Copy, a layer
 * below for Merge Down, a Mixer Brush for its commands) and otherwise reports why it did not run. Commands that
 * change the layers wait for the engine to report the change before the next intent of the same command runs, so
 * `new layer, multiply` blends the new layer. Variant-level actions (file pickers, the ABR importer, help, the
 * interface hand, colors to remember) come from `ui`. Must be created within a Solid owner.
 */
export function createCommandRunner(options: {
  session: PaintSession;
  /** The parser's view of the drawing, for naming layers in messages. */
  context: () => CommandContext;
  ui: {
    /** Opens the file picker to open a drawing or to insert an image; must run from a user gesture. */
    pickFile: (purpose: 'open' | 'insert') => void;
    openAbr: () => void;
    showHelp: () => void;
    setHand: (hand: 'left' | 'right') => void;
    rememberColor: (hex: string) => void;
    /** The playground page to return to, when there is one. */
    playground?: string;
  };
}) {
  const { session, ui } = options;
  const { tools, engine, selection, camera, symmetry, mixer, colorPicker, gradient, viewOptions, edit } = session;

  return {
    /** Runs `intents` in order and returns what each did. */
    async run(intents: readonly Intent[]): Promise<Outcome[]> {
      const outcomes: Outcome[] = [];
      for (const intent of intents) {
        const revision = latest(engine.state).revision;
        outcomes.push(runOne(intent));
        if (intents.length > 1 && changesLayers(intent)) {
          await documentChange(revision);
        }
      }

      return outcomes;
    }
  };

  function runOne(intent: Intent): Outcome {
    const done = (message = describeIntent(intent, options.context())): Outcome => ({ ok: true, message });
    const refuse = (message: string): Outcome => ({ ok: false, message });

    switch (intent.type) {
      case 'tool': {
        if ((intent.tool === 'fill' || intent.tool === 'gradient') && !latest(selection.selected)) {
          return refuse(`Select an area first: the ${intent.tool} works inside a selection.`);
        }

        session.chooseTool(intent.tool);
        return done();
      }
      case 'selection-tool':
        selection.setTool(intent.tool);
        session.chooseTool('lasso');
        return done();
      case 'transform': {
        const active = latest(session.transform.active);
        session.toggleTransform();
        return done(active ? 'Transform applied' : 'Transform · Enter applies, Escape cancels');
      }
      case 'preset':
        session.usePreset(intent.id);
        return done(`Brush ${intent.name}`);
      case 'size': {
        const brush = latest(tools.brush);
        const size = clamp(intent.px, 1, maxBrushSize(brush));
        tools.updateBrush({ size });
        return done(`Brush ${formatSize(size)} px`);
      }
      case 'scale-size': {
        const brush = latest(tools.brush);
        const size = clamp(brush.size * intent.factor, 1, maxBrushSize(brush));
        tools.updateBrush({ size });
        return done(`Brush ${formatSize(size)} px`);
      }
      case 'brush-value':
        tools.updateBrush({ [intent.key]: intent.value });
        return done();
      case 'color':
        if (latest(tools.tool) === 'eraser') {
          session.chooseTool('brush');
        }

        tools.updateBrush({ color: intent.hex });
        ui.rememberColor(intent.hex);
        return done();
      case 'colors':
        if (intent.action === 'swap') {
          tools.swapColors();
        } else if (intent.action === 'reset') {
          tools.resetColors();
        } else {
          colorPicker.arm();
          return done('Touch the canvas to pick a color');
        }

        return done();
      case 'layer':
        return runLayer(intent, done, refuse);
      case 'layer-flag': {
        const layer = layerAt(intent.layer);
        if (!layer) {
          return refuse(missingLayer(intent.layer));
        }

        if (intent.flag === 'clipping' && engine.state().layers[0]?.id === layer.id) {
          return refuse('The bottom layer cannot clip to a layer below it.');
        }

        const value = intent.value ?? !layer[intent.flag];
        edit({ type: 'layer', action: { type: 'update', id: layer.id, patch: { [intent.flag]: value } } });
        return done(describeIntent({ ...intent, value }, options.context()));
      }
      case 'layer-opacity':
      case 'layer-blend':
      case 'layer-rename': {
        const layer = layerAt(intent.layer);
        if (!layer) {
          return refuse(missingLayer(intent.layer));
        }

        const patch =
          intent.type === 'layer-opacity'
            ? { opacity: intent.value }
            : intent.type === 'layer-blend'
              ? { blend: intent.blend }
              : { name: intent.name };
        edit({ type: 'layer', action: { type: 'update', id: layer.id, patch } });
        return done();
      }
      case 'selection':
        return runSelection(intent.action, done, refuse);
      case 'feather':
        if (!latest(selection.selected)) {
          return refuse('Nothing is selected.');
        }

        selection.feather(intent.px);
        return done();
      case 'zoom':
        camera.zoomBy(intent.percent / 100 / camera.current().zoom);
        return done();
      case 'zoom-by':
        camera.zoomBy(intent.factor);
        return done(`Zoom ${Math.round(clamp(camera.current().zoom * intent.factor, 0.05, 32) * 100)}%`);
      case 'rotate': {
        const view = camera.current();
        const angle = intent.relative ? view.angle + toRadians(intent.degrees) : toRadians(intent.degrees);
        camera.navigate({ ...view, angle });
        return done(intent.relative ? `Rotated to ${Math.round(toDegrees(angle))}°` : undefined);
      }
      case 'view':
        return runView(intent.action, done, refuse);
      case 'window':
        if (intent.window !== 'palette') {
          session.windows.open(intent.window);
          return done();
        }

        session.windows.toggle('palette');
        return done(session.windows.isOpen('palette') ? 'Mixing palette' : 'Mixing palette closed');
      case 'symmetry':
        return runSymmetry(intent.mode, intent.segments, done, refuse);
      case 'quickshape': {
        if (intent.delay !== undefined) {
          session.quickShape.update({ enabled: true, delay: intent.delay });
          return done();
        }

        const enabled = intent.enabled ?? !latest(session.quickShape.settings).enabled;
        session.quickShape.update({ enabled });
        return done(enabled ? 'QuickShape on · hold the pen at the end of a stroke' : 'QuickShape off');
      }
      case 'history': {
        const can = intent.action === 'undo' ? latest(engine.state).canUndo : latest(engine.state).canRedo;
        if (!can) {
          return refuse(intent.action === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
        }

        for (let step = 0; step < intent.count; step++) {
          edit({ type: intent.action });
        }

        return done();
      }
      case 'file':
        if (intent.action === 'open' || intent.action === 'insert') {
          ui.pickFile(intent.action);
        } else if (intent.action === 'abr') {
          ui.openAbr();
        } else {
          edit({ type: intent.action });
        }

        return done();
      case 'mixer':
        if (!latest(mixer.available)) {
          return refuse('Choose a Mixer Brush preset first.');
        }

        if (intent.action === 'pick') {
          mixer.pick();
          return done('Touch the canvas to load paint');
        }

        void mixer.command(intent.action);
        return done();
      case 'app':
        if (intent.action === 'help') {
          ui.showHelp();
        } else if (intent.action === 'playground') {
          if (!ui.playground) {
            return refuse('There is no playground to return to.');
          }

          location.href = ui.playground;
        } else {
          ui.setHand(intent.action === 'hand-left' ? 'left' : 'right');
        }

        return done();
    }
  }

  function runLayer(
    intent: Extract<Intent, { type: 'layer' }>,
    done: (message?: string) => Outcome,
    refuse: (message: string) => Outcome
  ): Outcome {
    if (intent.action === 'add') {
      edit({ type: 'layer', action: { type: 'add' } });
      return done();
    }

    const layer = layerAt(intent.layer);
    if (!layer) {
      return refuse(missingLayer(intent.layer));
    }

    const { layers } = engine.state();
    const index = layers.findIndex((candidate) => candidate.id === layer.id);
    switch (intent.action) {
      case 'select':
        edit({ type: 'layer', action: { type: 'select', id: layer.id } });
        return done(`Layer ${layer.name}`);
      case 'delete':
        if (layers.length < 2) {
          return refuse('The last layer cannot be deleted.');
        }

        edit({ type: 'layer', action: { type: 'delete', id: layer.id } });
        return done();
      case 'duplicate':
        edit({ type: 'layer', action: { type: 'duplicate', id: layer.id } });
        return done();
      case 'merge-down': {
        const below = layers[index - 1];
        if (!below || !layer.visible || !below.visible) {
          return refuse(below ? 'Both layers must be visible to merge.' : 'There is no layer below to merge into.');
        }

        edit({ type: 'layer', action: { type: 'merge-down', id: layer.id } });
        return done();
      }
      case 'up':
      case 'down': {
        const top = index === layers.length - 1;
        if ((intent.action === 'up' && top) || (intent.action === 'down' && index === 0)) {
          return refuse(`${layer.name} is already at the ${intent.action === 'up' ? 'top' : 'bottom'}.`);
        }

        edit({ type: 'layer', action: { type: 'move', id: layer.id, direction: intent.action === 'up' ? 1 : -1 } });
        return done();
      }
    }
  }

  function runSelection(
    action: Extract<Intent, { type: 'selection' }>['action'],
    done: (message?: string) => Outcome,
    refuse: (message: string) => Outcome
  ): Outcome {
    switch (action) {
      case 'all':
        selection.selectAll();
        return done();
      case 'none':
        selection.clear();
        return done();
      case 'invert':
        selection.invert();
        return done();
      case 'paste':
        if (!latest(selection.hasClipboard)) {
          return refuse('Nothing has been copied.');
        }

        selection.action('paste');
        return done();
      default:
        if (!latest(selection.selected)) {
          return refuse('Nothing is selected.');
        }

        if (action === 'fill') {
          gradient.fillSelection();
        } else {
          selection.action(action);
        }

        return done();
    }
  }

  function runView(
    action: Extract<Intent, { type: 'view' }>['action'],
    done: (message?: string) => Outcome,
    refuse: (message: string) => Outcome
  ): Outcome {
    switch (action) {
      case 'reset':
        camera.reset();
        return done();
      case 'mirror': {
        const mirrored = !camera.current().mirrored;
        camera.toggleMirror();
        return done(mirrored ? 'View mirrored' : 'View not mirrored');
      }
      case 'fullscreen':
        if (!document.fullscreenEnabled) {
          return refuse('Full screen is unavailable in this browser.');
        }

        void session.fullscreen.props.onClick();
        return done(latest(session.fullscreen.isActive) ? 'Full screen off' : 'Full screen');
      case 'pixel-grid': {
        const pixelGrid = !viewOptions.settings().pixelGrid;
        viewOptions.update({ pixelGrid });
        return done(pixelGrid ? 'Pixel grid on' : 'Pixel grid off');
      }
    }
  }

  function runSymmetry(
    mode: PaintSymmetry['mode'],
    segments: number | undefined,
    done: (message?: string) => Outcome,
    refuse: (message: string) => Outcome
  ): Outcome {
    const current = latest(symmetry.symmetry);
    // A guide turned on starts at the center of the view.
    const center = current.mode === 'off' ? { x: camera.current().x, y: camera.current().y } : {};
    const updated = symmetry.update({ ...current, ...center, mode, ...(segments === undefined ? {} : { segments }) });
    if (!updated) {
      return refuse('Symmetry can change once the drawing is ready.');
    }

    if (mode !== 'off' && !latest(session.supportsSymmetry)) {
      return done(`${describeIntent({ type: 'symmetry', mode, segments }, options.context())} · not for this brush`);
    }

    return done();
  }

  /** The layer with number `index` from 1 at the bottom, or the active layer. */
  function layerAt(index: number | undefined) {
    const state = latest(engine.state);
    return index === undefined ? state.layers.find((layer) => layer.id === state.activeId) : state.layers[index - 1];
  }

  /** Resolves once the engine reports a document revision after `revision`, or after a second. */
  function documentChange(revision: number) {
    return new Promise<void>((resolve) => {
      const started = performance.now();
      const check = () => {
        if (latest(engine.state).revision !== revision || performance.now() - started > 1000) {
          resolve();
          return;
        }

        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }
}

/**
 * The drawing as the parser and the palette see it, from `session`: the presets, the layers bottom first with their
 * details, the active layer and whether the Mixer Brush is in use. `playground` tells whether there is a playground
 * page to return to. Must be created within a Solid owner.
 */
export function createPaletteContext(session: PaintSession, playground: boolean) {
  const { engine, library, mixer } = session;
  return createMemo((): PaletteContext => {
    const { layers, activeId } = engine.state();
    return {
      presets: library.presets().map(({ id, name }) => ({ id, name })),
      layers: layers.map(({ name }) => ({ name })),
      layerDetails: layers.map(({ visible, opacity, blend }) => ({ visible, opacity, blend })),
      activeLayer: layers.findIndex((layer) => layer.id === activeId) + 1,
      mixer: mixer.available(),
      playground
    };
  });
}

/**
 * One line for what a command did: the first failure, or what every intent did; a spoken command starts with what was
 * `heard`.
 */
export function summarize(outcomes: readonly Outcome[], heard?: string): Outcome {
  const failed = outcomes.find((outcome) => !outcome.ok);
  const message = (failed ? [failed] : outcomes).map((outcome) => outcome.message).join(' · ');
  return { ok: !failed, message: heard ? `“${heard}” → ${message}` : message };
}

/** Intents after which the next one may address a different layer, once the engine has applied them. */
function changesLayers(intent: Intent) {
  return intent.type === 'layer' || intent.type === 'history';
}

function missingLayer(index: number | undefined) {
  return index === undefined ? 'There is no active layer.' : `There is no layer ${index}.`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** A brush size for display: tenths below 10 px, whole pixels above. */
function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  const degrees = ((((radians * 180) / Math.PI + 180) % 360) + 360) % 360;
  return degrees - 180;
}
