// @vitest-environment jsdom
import { defaultCamera } from '@app-game/paint-core/camera';
import { attachInput } from '@app-game/paint-core/input';
import { render } from '@solidjs/web';
import 'fake-indexeddb/auto';
import { createRoot, createSignal, flush, getOwner, OBSERVE, type Owner } from 'solid-js';
import { attribution } from 'solid-js/attribution';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PreviewAttachment } from '../../features/brush-library/previewAttachment';
import { createPaintSession } from '../../features/session';
import { BoardView } from './BoardView';
import { createBoard } from './createBoard';
import { attachCataloguePreview, createCatalogueFixture } from './createCatalogueFixture';
import { createSheet } from './createSheet';
import { createKits } from './kits';
import { createLegoServices, LegoServicesContext } from './LegoServices';
import { PartFrame } from './PartFrame';
import { partDefinitions } from './parts';
import { catalogueSpecimens } from './PartsShowcase';

const frames = new Map<number, FrameRequestCallback>();
const intersections = new Map<Element, IntersectionObserverCallback>();
const disposers: (() => void)[] = [];
const pickerPaints = vi.fn();
const presetRenders = vi.fn();
const colorOwners = new Set<Owner>();
const partOwners = new Set<Owner>();
let frameId = 0;
beforeEach(() => {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      Object.assign(new EventTarget(), {
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {}
      }) satisfies MediaQueryList
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        intersections.set(element, this.callback);
      }
      unobserve(element: Element) {
        intersections.delete(element);
      }
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(80);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this instanceof HTMLCanvasElement ? new DOMRect(0, 0, 80, 80) : new DOMRect(0, 0, 1200, 900);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy(
      {
        createImageData: (width: number, height: number) => ({
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4)
        }),
        putImageData: pickerPaints
      },
      { get: (target, key) => Reflect.get(target, key) ?? (() => {}) }
    ) as unknown as ReturnType<HTMLCanvasElement['getContext']>
  );
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
  for (const definition of partDefinitions) {
    const render = definition.render;
    vi.spyOn(definition, 'render').mockImplementation((...args) => {
      partOwners.add(getOwner()!);
      if (definition.family === 'color') {
        colorOwners.add(getOwner()!);
      }
      return render(...args);
    });
  }
});
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  flush();
  attribution.disable();
  frames.clear();
  intersections.clear();
  colorOwners.clear();
  partOwners.clear();
  pickerPaints.mockClear();
  presetRenders.mockClear();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([undefined, true] as const)(
  'keeps the complete mounted catalogue quiet during pen input and unrelated brush changes, floating=%s',
  async (floating) => {
    const fixture = owned(createCatalogueFixture);
    await fixture.tools.loaded;
    const session = owned(createPaintSession);
    const [layerState, setLayerState] = owned(() => createSignal(session.engine.state()));
    const services = owned(() =>
      createLegoServices({
        ...session,
        engine: { ...session.engine, state: layerState },
        tools: fixture.tools,
        brush: fixture.tools.brush,
        library: fixture.library,
        setColor: fixture.services.color.set
      })
    );
    const board = owned(createBoard);
    const sheet = owned(() => createSheet(() => 900));
    const kits = owned(createKits);
    const specimens = catalogueSpecimens(fixture.presets[0]!.id).filter(
      (specimen) => !specimen.kind.startsWith('preset:')
    );
    const parts = [
      ...specimens.map((specimen) => ({
        ...specimen,
        looks: specimen.look ? { [`${specimen.span.columns}x${specimen.span.rows}`]: specimen.look } : undefined
      })),
      ...fixture.presets.map((preset) => ({
        id: preset.id,
        kind: `preset:${preset.id}`,
        span: { columns: 2, rows: 2 }
      }))
    ].map((part, index) => ({ ...part, cell: { column: (index % 12) * 5, row: Math.floor(index / 12) * 5 } }));
    board.set({ panels: [{ id: 'catalogue', at: { x: 0, y: 0 }, floating, parts }] });
    const [editing, setEditing] = createSignal(false);
    disposers.push(
      render(
        () => (
          <LegoServicesContext value={services}>
            <PreviewAttachment
              value={(canvas) => {
                const connection = attachCataloguePreview(canvas);
                return {
                  ...connection,
                  update: (configuration) => {
                    presetRenders(configuration);
                    connection.update(configuration);
                  }
                };
              }}
            >
              <BoardView
                board={board}
                sheet={sheet}
                kits={kits}
                session={{
                  size: () => ({ width: 1200, height: 900 }),
                  library: fixture.library,
                  brush: fixture.tools.brush
                }}
                editing={editing()}
                openPanel={undefined}
                onOpenPanel={() => {}}
                onPopup={() => {}}
              />
            </PreviewAttachment>
          </LegoServicesContext>
        ),
        document.body
      )
    );
    await drain();
    intersectAll();
    await drain();
    expect(document.querySelectorAll('[data-part]')).toHaveLength(parts.length);
    expect(document.querySelector('[aria-label^="Broken part:"]')).toBeNull();
    expect(presetRenders).toHaveBeenCalledTimes(64);
    expect(pickerPaints.mock.calls.length).toBeGreaterThanOrEqual(4);

    const canvas = document.body.appendChild(document.createElement('canvas'));
    const input = session.canvasInput();
    const send = vi.fn(input.send);
    const drawn = vi.fn(input.drawn);
    disposers.push(
      attachInput(canvas, {
        ...input,
        camera: defaultCamera,
        size: () => ({ width: 1200, height: 900 }),
        brush: fixture.tools.brush,
        ready: () => true,
        navigate: () => {},
        showPenCursor: () => true,
        drawn,
        send
      })
    );
    let time = 1;
    const pointer = (type: string, x: number) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        buttons: 1,
        pressure: 0.5,
        clientX: x,
        clientY: 450
      });
      Object.defineProperty(event, 'timeStamp', { value: time++ });
      canvas.dispatchEvent(event);
      flush();
    };
    pointer('pointerdown', 600);
    await drain();
    send.mockClear();
    const pen = await measure(() => {
      for (let i = 0; i < 100; i++) {
        pointer('pointermove', 601 + i);
      }
    });
    expect(send.mock.calls.filter(([command]) => command.type === 'samples')).toHaveLength(100);
    expect(session.cursor()).toEqual({ x: 700, y: 450 });
    expect(drawn).toHaveBeenCalledTimes(101);
    expectPenBudget(pen);

    // A deliberately bad part captures the same session cursor reachable by an app binding.
    // The identical budget must reject that per-move dependency.
    const badDefinition = partDefinitions.find((definition) => definition.kind === 'color:swatch')!;
    const healthyRender = vi.mocked(badDefinition.render).getMockImplementation()!;
    vi.mocked(badDefinition.render).mockImplementation((...args) => {
      const view = healthyRender(...args);
      return (
        <>
          {view}
          <BadCursorPart />
        </>
      );
    });
    function BadCursorPart() {
      partOwners.add(getOwner()!);
      colorOwners.add(getOwner()!);
      return <span>{session.cursor()?.x}</span>;
    }
    const stopBadPart = render(
      () => (
        <LegoServicesContext value={services}>
          <PartFrame kind="color:swatch" span={{ columns: 2, rows: 2 }} mode="live" immediate />
        </LegoServicesContext>
      ),
      document.body.appendChild(document.createElement('div'))
    );
    await drain();
    const negative = await measure(() => {
      for (let i = 0; i < 100; i++) {
        pointer('pointermove', 701 + i);
      }
    });
    expect(negative.reruns).toBeGreaterThanOrEqual(100);
    expect(negative.colorReruns).toBeGreaterThanOrEqual(100);
    expect(negative.domWrites).toBeGreaterThanOrEqual(100);
    expect(() => expectPenBudget(negative)).toThrow();
    stopBadPart();
    vi.mocked(badDefinition.render).mockImplementation(healthyRender);
    pointer('pointerup', 701);
    await drain();

    const size = await measure(() => {
      fixture.tools.updateBrush({ size: 64 });
    });
    expect(size.colorReruns).toBe(0);
    expect(size.presetRenders).toBe(0);
    expect(size.pickerPaints).toBe(0);
    const layers = await measure(() => {
      setLayerState((state) => ({ ...state, layers: state.layers.map((layer) => ({ ...layer, name: 'Renamed' })) }));
    });
    expect(layers.colorReruns).toBe(0);
    expect(layers.pickerPaints).toBe(0);
    expect(layers.presetRenders).toBe(0);
    const color = await measure(() => {
      services.color.set('#c4463a');
    });
    console.log('LEGO budgets', { pen, size, layers, color });
    // RC.13 ceilings include facade work; reruns now count only descendants of mounted part bindings.
    // Ceilings leave 20% room; positive controls prove the counters see real updates.
    expect(size.reruns).toBeGreaterThan(0);
    expect(size.domWrites).toBeGreaterThan(0);
    expect(color.colorReruns).toBeGreaterThan(0);
    expect(color.reruns).toBeLessThanOrEqual(167);
    expect(color.domWrites).toBeLessThanOrEqual(316);

    setEditing(true);
    await drain();
    const tray = document.querySelector('[aria-label="Box of parts"]')!;
    expect(tray.hasAttribute('data-closed')).toBe(true);
    expect(tray.querySelectorAll('[data-mode="preview"]')).toHaveLength(0);
    sheet.to('middle');
    await drain();
    intersectAll();
    await drain();
    expect(tray.querySelectorAll('[data-mode="preview"]').length).toBeGreaterThan(0);
    sheet.to('closed');
    await drain();
    expect(tray.querySelectorAll('[data-mode="preview"]')).toHaveLength(0);
    expect(fixture.error()).toBeUndefined();
  }
);

async function measure(action: () => void) {
  const records: MutationRecord[] = [];
  const recording = new MutationObserver((changes) => {
    records.push(...changes);
  });
  recording.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
  pickerPaints.mockClear();
  presetRenders.mockClear();
  let colorReruns = 0;
  let reruns = 0;
  expect(OBSERVE).toBeDefined();
  const unsubscribe = OBSERVE!.records.subscribe('rerun', (_event, node) => {
    for (let owner: Owner | null = node; owner; owner = owner._parent) {
      if (partOwners.has(owner)) {
        reruns++;
        break;
      }
    }
    for (let owner: Owner | null = node; owner; owner = owner._parent) {
      if (colorOwners.has(owner)) {
        colorReruns++;
        break;
      }
    }
  });
  const release = attribution.enable({ log: false, historyLimit: 100000 });
  action();
  await drain();
  records.push(...recording.takeRecords());
  recording.disconnect();
  const result = {
    reruns,
    colorReruns,
    domWrites: records.length,
    pickerPaints: pickerPaints.mock.calls.length,
    presetRenders: presetRenders.mock.calls.length
  };
  unsubscribe();
  release();
  return result;
}

function owned<T>(factory: () => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return factory();
  });
}

function intersectAll() {
  for (const [target, callback] of [...intersections]) {
    callback([{ target, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
  flush();
}

async function drain() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    flush();
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(performance.now()));
  }
  flush();
  expect(frames.size).toBe(0);
}

/** No mounted part may react to drawing-only input. Also used by the deliberately failing control. */
function expectPenBudget(result: Awaited<ReturnType<typeof measure>>) {
  expect(result).toEqual({ reruns: 0, colorReruns: 0, domWrites: 0, pickerPaints: 0, presetRenders: 0 });
}
