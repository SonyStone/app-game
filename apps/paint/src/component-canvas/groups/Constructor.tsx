import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { createSignal, For, Show, useContext } from 'solid-js';
import type { PaintTool } from '../../features/brush';
import { builtInPresets } from '../../features/brush-library';
import type { ColorWheelSettings } from '../../features/color-wheel';
import { layoutId, parsePageLayout, type PageLayout } from '../../variants/layout';
import { layoutParts, type PartContext } from '../../variants/layout/parts';
import styles from '../ComponentCanvas.module.css';
import { PageConstructor } from '../createPageConstructor';
import { fourLayers, seededDocument } from '../seededLayers';
import { CanvasGroup, CanvasRow } from '../Specimen';

/**
 * The page constructor: a screen as large as the MovinkPad's, landscape or portrait, onto which parts are dragged
 * from their specimens (the grip in a specimen's caption) or added from the list. On the screen a part moves by its
 * header and leaves by ×. "Build page" saves the page as a layout file, which becomes a variant page `layout-<id>` on
 * the drawing session (see `variants/layout`). Parts here run on state of the constructor's own: the test layers,
 * Paint's presets and a brush of their own, shared by every part on the screen, as the session is on the page.
 */
export function Constructor() {
  const constructor = useContext(PageConstructor)!;
  const context = canvasPartContext();
  const [name, setName] = createSignal('My page');
  const [choice, setChoice] = createSignal(Object.keys(layoutParts)[0]!);
  const [status, setStatus] = createSignal<{ text: string; href?: string }>();
  const [saved, setSaved] = createSignal<readonly { id: string; layout: PageLayout }[]>([]);
  const elements = new Map<number, HTMLElement>();
  const refreshSaved = async () =>
    setSaved(
      Object.entries(await constructor.saved()).flatMap(([id, value]) => {
        const layout = parsePageLayout(value);
        return layout ? [{ id, layout }] : [];
      })
    );
  void refreshSaved();

  const build = async () => {
    const factor = constructor.scale();
    const layout = constructor.layout(name().trim() || 'My page', (key) => {
      const box = elements.get(key)?.getBoundingClientRect();
      return { width: Math.max(1, (box?.width ?? 1) / factor), height: Math.max(1, (box?.height ?? 1) / factor) };
    });
    try {
      const id = await constructor.build(layout);
      setStatus({
        text: `Saved as src/variants/layouts/${layoutId(layout.name)}.json. Open the page:`,
        href: `/paint/${id}`
      });
      void refreshSaved();
    } catch (error) {
      setStatus({ text: `Not saved: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  return (
    <CanvasGroup
      id="constructor"
      title="Page constructor"
      omitted={
        <>
          Parts that read the drawing session itself (the Puck cluster's brush and tool cards, the Desktop bars and
          dock, Studio's top bar) cannot be placed yet. A page shows the session's navigation puck as every variant
          does. After building, open the page from the link or from the Paint index; a new page needs the index
          reloaded.
        </>
      }
    >
      <CanvasRow title="Page" note={`${constructor.screen().width} × ${constructor.screen().height} CSS px`}>
        <div class={styles.constructorBar}>
          <button
            aria-pressed={constructor.orientation() === 'portrait' ? 'true' : 'false'}
            onClick={() => constructor.setOrientation((side) => (side === 'landscape' ? 'portrait' : 'landscape'))}
          >
            {constructor.orientation() === 'landscape' ? 'Landscape' : 'Portrait'}
          </button>
          <select
            aria-label="Part to add"
            value={choice()}
            onChange={(event) => setChoice(event.currentTarget.value)}
            data-canvas-content
          >
            <For each={Object.entries(layoutParts)}>{([id, part]) => <option value={id}>{part.name}</option>}</For>
          </select>
          <button onClick={() => constructor.add(choice())}>Add</button>
          <input
            aria-label="Page name"
            value={name()}
            onChange={(event) => setName(event.currentTarget.value)}
            data-canvas-content
          />
          <button disabled={constructor.placed().length === 0} onClick={() => void build()}>
            Build page
          </button>
          <Show when={status()}>
            {(current) => (
              <span class={styles.constructorStatus}>
                {current().text}{' '}
                <Show when={current().href}>{(href) => <a href={href()}>{href()}</a>}</Show>
              </span>
            )}
          </Show>
        </div>
        <Show when={saved().length > 0}>
          <div class={styles.constructorBar}>
            <span class={styles.constructorStatus}>Edit a built page:</span>
            <For each={saved()}>
              {(entry) => <button onClick={() => constructor.load(entry.layout)}>{entry.layout.name}</button>}
            </For>
          </div>
        </Show>
        <div
          ref={constructor.bindScreen}
          class={styles.constructorScreen}
          style={{ width: `${constructor.screen().width}px`, height: `${constructor.screen().height}px` }}
        >
          <Show when={constructor.placed().length === 0}>
            <span class={styles.screenNote}>Drag a specimen here by the grip in its caption, or add a part above.</span>
          </Show>
          <For each={constructor.placed()} keyed={(item) => item.key}>
            {(item) => (
              <div
                ref={(element) => elements.set(item().key, element)}
                class={styles.constructorPart}
                style={{ left: `${item().x}px`, top: `${item().y}px` }}
              >
                <div
                  class={styles.constructorHandle}
                  data-canvas-content
                  onPointerDown={(event) => moveWith(event, (dx, dy) => constructor.moveBy(item().key, dx, dy))}
                >
                  <span>⠿ {layoutParts[item().part]?.name ?? item().part}</span>
                  <button
                    aria-label="Remove from the page"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      elements.delete(item().key);
                      constructor.remove(item().key);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div data-canvas-content>{layoutParts[item().part]?.render(context)}</div>
              </div>
            )}
          </For>
        </div>
      </CanvasRow>
    </CanvasGroup>
  );
}

/** Follows a press with pointer capture, reporting each move's change in window pixels to `move`. */
function moveWith(event: PointerEvent, move: (dx: number, dy: number) => void) {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  event.preventDefault();
  let last = { x: event.clientX, y: event.clientY };
  const onMove = (next: PointerEvent) => {
    move(next.clientX - last.x, next.clientY - last.y);
    last = { x: next.clientX, y: next.clientY };
  };
  const onEnd = () => {
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onEnd);
    element.removeEventListener('pointercancel', onEnd);
  };
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onEnd);
  element.addEventListener('pointercancel', onEnd);
}

/**
 * What the constructor's parts read and change: a brush, recent colors, the test layers' document, Paint's presets, a
 * tool and the picker settings, all the constructor's own. Must be created within a Solid owner.
 */
function canvasPartContext(): PartContext {
  const [brush, setBrush] = createSignal<Brush>({ ...defaultBrush(), color: '#c8553d' });
  const [recent, setRecent] = createSignal<readonly string[]>([]);
  const drawing = seededDocument(fourLayers);
  const [document, setDocument] = createSignal(drawing.state());
  const [preset, setPreset] = createSignal(builtInPresets[0]!.id);
  const [tool, setTool] = createSignal<PaintTool>('brush');
  const [mirrored, setMirrored] = createSignal(false);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [wheel, setWheel] = createSignal<ColorWheelSettings>({
    picker: 'square',
    harmony: 'none',
    mask: 'none',
    maskAngle: 0,
    customMask: []
  });
  const edit = (change: () => void) => {
    try {
      change();
    } catch {
      // Merging needs the engine's pixels.
    }

    setDocument(drawing.state());
  };

  return {
    brush,
    updateBrush: (patch) => setBrush((current) => ({ ...current, ...patch })),
    swapColors: () =>
      setBrush((current) => ({
        ...current,
        color: current.backgroundColor ?? '#ffffff',
        backgroundColor: current.color
      })),
    recentColors: recent,
    rememberColor: (color) => setRecent((list) => [color, ...list.filter((entry) => entry !== color)].slice(0, 10)),
    document,
    ready: () => true,
    layer: (action) => edit(() => drawing.changeLayer(action)),
    blending: (linear) => edit(() => drawing.setLinearBlending(linear)),
    presets: () => builtInPresets,
    preset,
    recentPresets: () => [preset()],
    usePreset: setPreset,
    tool,
    chooseTool: setTool,
    mirrored,
    toggleMirror: () => setMirrored((on) => !on),
    palette: { open: paletteOpen, toggle: () => setPaletteOpen((open) => !open) },
    wheel: { settings: wheel, update: (patch) => setWheel((current) => ({ ...current, ...patch })) }
  };
}
