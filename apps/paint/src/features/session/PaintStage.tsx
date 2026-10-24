import { screenToWorld, worldToScreen } from '@app-game/paint-core/camera';
import type { JSX } from '@solidjs/web';
import { Show, untrack } from 'solid-js';
import { BrushAdjustHud } from '../brush';
import { BrushCursor, CanvasDebug, PaintCanvas } from '../canvas';
import { ColorPickerLoupe } from '../color';
import { FrameGuides } from '../frames';
import { GradientPreview } from '../gradient';
import { LocalUndoOverlay } from '../local-undo';
import { PalmRejectionDebug } from '../palm-rejection';
import { PerformancePanel } from '../performance';
import { QuickShapeHint } from '../quickshape';
import { selectionClipPath } from '../selection';
import { SymmetryGuide } from '../symmetry';
import { TransformOverlay } from '../transform';
import type { PaintSession } from './createPaintSession';
import styles from './PaintEditor.module.css';
import { SessionWindows } from './SessionWindows';

/**
 * The element holding a whole Paint variant: a full-window box that keeps browser page gestures, text selection and
 * iOS callouts off the editor. Fullscreen and the pointer type attribute apply to it. The variant adds its own look
 * with `class`. The session's open windows float over the variant's UI (see `SessionWindows`), unless `windows` is
 * false: then the variant places them itself, such as inside the card a side menu pushes aside.
 */
export function PaintEditor(props: {
  session: PaintSession;
  class?: string;
  /** Whether the editor shows the session's windows over the variant's UI; true by default. */
  windows?: boolean;
  /** Inline style for the variant's own look, such as custom properties its stylesheet reads. */
  style?: JSX.HTMLAttributes<HTMLDivElement>['style'];
  children: JSX.Element;
}) {
  return (
    <div ref={props.session.setEditor} class={`${styles.editor} ${props.class ?? ''}`} style={props.style}>
      {props.children}
      <Show when={props.windows ?? true}>
        <SessionWindows session={props.session} />
      </Show>
    </div>
  );
}

/**
 * The drawing workspace: the canvas filling it, with the session's input, and the overlays passed as children over
 * it. Its size is the view size. Dropped image files are placed on the drawing.
 */
export function PaintStage(props: {
  session: PaintSession;
  /** Variant-specific canvas input; see `PaintSession.canvasInput`. Read once. */
  input?: Parameters<PaintSession['canvasInput']>[0];
  class?: string;
  children?: JSX.Element;
}) {
  const session = untrack(() => props.session);
  const input = session.canvasInput(untrack(() => props.input));
  const { engine, mixer, colorPicker, images, tool } = session;

  return (
    <main
      ref={[session.setStage, images.ref]}
      class={`${styles.stage} ${props.class ?? ''}`}
      aria-label="Drawing workspace"
      data-picking={mixer.picking() || colorPicker.armed()}
      data-dropping={images.isOver()}
    >
      <Show when={engine.session()} keyed>
        {(running) => (
          <PaintCanvas
            connect={(element) => engine.connect(element, running.mode)}
            input={input}
            crosshair={
              tool() === 'lasso' ||
              tool() === 'fill' ||
              tool() === 'gradient' ||
              (tool() === 'local-undo' && !session.masksWithBrush())
            }
            ref={session.setCanvas}
          />
        )}
      </Show>
      {props.children}
    </main>
  );
}

/** Frame outlines and the symmetry axes, drawn on the canvas under every other overlay. */
export function StageGuides(props: { session: PaintSession }) {
  const toScreen = (point: { x: number; y: number }) =>
    worldToScreen(point, props.session.camera.camera(), props.session.size());

  return (
    <>
      <FrameGuides
        frames={props.session.frames.frames()}
        activeId={props.session.frames.activeFrame()?.id}
        toScreen={toScreen}
      />
      <SymmetryGuide
        symmetry={props.session.symmetry.symmetry()}
        camera={props.session.camera.camera()}
        size={props.session.size()}
        active={props.session.supportsSymmetry()}
      />
    </>
  );
}

/**
 * Overlays of work in progress on the canvas: the brush size and opacity HUD while adjusting, the transform box, the
 * brush cursor, the local undo's area and mask brush cursor, the color picker loupe, the gradient preview, the Mixer
 * Brush pick hint and the name of the shape a held stroke became.
 */
export function StageOverlays(props: {
  session: PaintSession;
  /** Shows the brush cursor where the pointer hovers; true by default. A variant hides it while a press would not draw. */
  cursor?: boolean;
}) {
  const session = untrack(() => props.session);
  const { camera, size, brush, transform, colorPicker, gradient, selection, mixer, quickShape, localUndo } = session;
  const toScreen = (point: { x: number; y: number }) => worldToScreen(point, camera.camera(), size());
  const toDocument = (point: { x: number; y: number }) => screenToWorld(point, camera.current(), size());

  return (
    <>
      <Show when={session.brushAdjust.anchor()}>
        {(anchor) => (
          <BrushAdjustHud
            anchor={anchor()}
            size={brush().size}
            opacity={brush().opacity}
            color={brush().color}
            zoom={camera.camera().zoom}
          />
        )}
      </Show>
      <Show when={transform.bounds()}>
        {(bounds) => (
          <TransformOverlay
            bounds={bounds()}
            box={transform.box()}
            settings={transform.settings()}
            size={size()}
            toScreen={toScreen}
            toDocument={toDocument}
            onChange={transform.setBox}
            onSettings={transform.setSettings}
            onFlip={transform.flip}
            onRotate={transform.rotate}
            onDistort={transform.distort}
            onWarp={transform.warp}
            onWarpGrid={transform.warpGrid}
            onReset={transform.reset}
            onCancel={() => void transform.cancel()}
            onDone={() => void transform.end()}
          />
        )}
      </Show>
      <Show
        when={
          (props.cursor ?? true) &&
          session.ready() &&
          session.paintsWithBrush() &&
          !transform.active() &&
          !colorPicker.preview() &&
          session.cursor()
        }
      >
        {(point) => <BrushCursor point={point()} size={session.cursorSize()} square={session.blockCursor()} />}
      </Show>
      <Show when={(props.cursor ?? true) && session.ready() && session.masksWithBrush() && session.cursor()}>
        {(point) => (
          <BrushCursor
            point={point()}
            size={Math.max(2, localUndo.settings().size * camera.camera().zoom)}
            square={false}
          />
        )}
      </Show>
      <Show when={session.tool() === 'local-undo'}>
        <LocalUndoOverlay
          outline={localUndo.shown()?.outline}
          gesture={localUndo.gesture()}
          toScreen={toScreen}
          zoom={camera.camera().zoom}
          size={size()}
        />
      </Show>
      <Show when={colorPicker.preview()}>{(preview) => <ColorPickerLoupe preview={preview()} />}</Show>
      <Show when={gradient.preview()}>
        {(command) => (
          <GradientPreview
            command={command()}
            toScreen={toScreen}
            size={size()}
            clip={selectionClipPath(selection.summary(), toScreen, size())}
          />
        )}
      </Show>
      <Show when={mixer.picking()}>
        <StageHint role="status">Tap the canvas to load paint. Escape to cancel.</StageHint>
      </Show>
      <Show when={quickShape.hint()}>{(hint) => <QuickShapeHint hint={hint()} />}</Show>
    </>
  );
}

/**
 * The palm rejection zone with tile and paging diagnostics, and the frame-cost panel, each while turned on in the
 * developer settings.
 */
export function StageDiagnostics(props: { session: PaintSession }) {
  const { developer, engine, camera, size, monitor, palm } = untrack(() => props.session);

  return (
    <>
      <Show when={developer.debug()}>
        <PalmRejectionDebug palm={palm} />
        <CanvasDebug
          tiles={engine.debugTiles()}
          paging={engine.paging()}
          camera={camera.camera()}
          size={size()}
          document={engine.state()}
          gpuBytes={engine.metrics().gpu}
        />
      </Show>
      <Show when={developer.performanceMonitor()}>
        <PerformancePanel samples={monitor.samples()} idle={monitor.idle()} />
      </Show>
    </>
  );
}

/** A quiet line of text in the middle of the canvas that lets every contact through. */
export function StageHint(props: { role?: 'status'; children: JSX.Element }) {
  return (
    <div class={styles.hint} role={props.role}>
      <p>{props.children}</p>
    </div>
  );
}
