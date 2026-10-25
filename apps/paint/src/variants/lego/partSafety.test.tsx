// @vitest-environment jsdom
import { defaultBrush } from '@app-game/paint-core/brush';
import { render } from '@solidjs/web';
import { createMemo, createRoot, createSignal, flush, Show } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createBoard } from './createBoard';
import { createKits } from './kits';
import { PartFrame } from './PartFrame';
import { PartView, ValuePart, type Session } from './parts';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }

  flush();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('isolates a throwing part, including one mounted later, and keeps its sibling updating', () => {
  const { session, setBrush } = fakeSession();
  const [dropped, setDropped] = createSignal(false);
  const broken = {
    ...session,
    engine: {
      state: () => {
        throw new Error('broken engine read');
      }
    }
  } as unknown as Session;
  renderOwned(() => (
    <>
      <PartView kind="color:pair" span={{ columns: 2, rows: 1 }} session={session} onPopup={() => {}} />
      <Show when={dropped()}>
        <PartView kind="action:undo" span={{ columns: 1, rows: 1 }} session={broken} onPopup={() => {}} />
      </Show>
    </>
  ));
  setDropped(true);
  flush();
  expect(document.body.textContent).toContain('Broken part');
  expect(document.body.textContent).toContain('action:undo');
  setBrush((brush) => ({ ...brush, color: '#0000ff' }));
  flush();
  expect((document.querySelector('[aria-label="Foreground color"]') as HTMLElement).style.background).toBe(
    'rgb(0, 0, 255)'
  );
});

it('isolates reactive failures and retries the region', () => {
  const [fails, setFails] = createSignal(false);
  let attempts = 0;
  const Broken = () => {
    const value = createMemo(() => {
      const fail = fails();
      attempts += 1;
      if (fail && attempts === 2) {
        throw new Error('reactive failure');
      }

      return 'working';
    });
    return <span>{value()}</span>;
  };
  renderOwned(() => (
    <>
      <PartFrame kind="test">
        <Broken />
      </PartFrame>
      <span>{fails() ? 'sibling updated' : 'sibling'}</span>
    </>
  ));
  setFails(true);
  flush();
  expect(document.body.textContent).toContain('Broken part');
  expect(document.body.textContent).toContain('sibling updated');
  document.querySelector('button')!.click();
  flush();
  expect(document.body.textContent).toContain('working');
});

it.each([
  'action:future',
  'value:future',
  'color:foo',
  'preset:missing',
  'bogus',
  'action:toString',
  'value:__proto__'
])('renders unavailable %s without failing', (kind) => {
  const { session } = fakeSession();
  renderOwned(() => <PartView kind={kind} span={{ columns: 1, rows: 1 }} session={session} onPopup={() => {}} />);
  expect(document.body.textContent).toContain('?');
  expect(document.body.textContent).not.toContain('Broken part');
});

it('reports synchronous and asynchronous part commands through the session notice', async () => {
  const { session } = fakeSession();
  session.undo = () => {
    throw new Error('undo failed');
  };
  renderOwned(() => (
    <PartView kind="action:undo" span={{ columns: 1, rows: 1 }} session={session} onPopup={() => {}} />
  ));
  document.querySelector('button')!.click();
  expect(session.setError).toHaveBeenCalledWith(expect.objectContaining({ message: 'undo failed' }));
  session.choosePreset = vi.fn().mockRejectedValue(new Error('preset failed'));
  renderOwned(() => (
    <PartView kind="preset:found" span={{ columns: 1, rows: 1 }} session={session} onPopup={() => {}} />
  ));
  document.querySelectorAll('button')[1]!.click();
  await vi.waitFor(() =>
    expect(session.setError).toHaveBeenCalledWith(expect.objectContaining({ message: 'preset failed' }))
  );
});

it('remembers a settled color after its number field echoes input live', () => {
  const { session } = fakeSession();
  renderOwned(() => (
    <PartView kind="value:hue" look="number" span={{ columns: 1, rows: 1 }} session={session} onPopup={() => {}} />
  ));
  const input = document.querySelector('input')!;
  pointer(input, 'pointerdown', 0);
  pointer(input, 'pointermove', 20);
  expect(localStorage.getItem('paint.recentColors')).toBeNull();
  pointer(input, 'pointerup', 20);
  expect(JSON.parse(localStorage.getItem('paint.recentColors')!)).toEqual([session.brush().color]);
});

it.each(['knob', 'slider'] as const)('restores the exact brush opacity when a %s loses capture', (look) => {
  const { session, setBrush } = fakeSession();
  setBrush((brush) => ({ ...brush, opacity: 0.5 }));
  flush();
  renderOwned(() => (
    <PartFrame kind="value:opacity">
      <ValuePart value="opacity" look={look} span={{ columns: 3, rows: 1 }} session={session} />
    </PartFrame>
  ));
  const slider = document.querySelector<HTMLElement>('[role="slider"]')!;
  slider.getBoundingClientRect = () => new DOMRect(0, 0, 100, 40);
  pointer(slider, 'pointerdown', 30);
  pointer(slider, 'pointermove', 60);
  expect(session.brush().opacity).not.toBe(0.5);
  pointer(slider, 'lostpointercapture', 60);
  pointer(slider, 'pointerup', 60);
  expect(session.brush().opacity).toBe(0.5);
});

it('renders future kinds loaded from both board and kit storage without halting siblings', () => {
  const parts = ['action:future', 'value:future'].map((kind) => ({
    id: kind,
    kind,
    cell: { column: 0, row: 0 },
    span: { columns: 1, rows: 1 }
  }));
  localStorage.setItem('paint.lego', JSON.stringify({ panels: [{ id: 'panel', at: { x: 0, y: 0 }, parts }] }));
  localStorage.setItem('paint.lego.kits', JSON.stringify([{ id: 'saved', name: 'Saved', parts, owned: [] }]));
  const board = owned(createBoard);
  const kits = owned(createKits);
  const { session, setBrush } = fakeSession();
  renderOwned(() => <PartView kind="color:pair" span={{ columns: 2, rows: 1 }} session={session} onPopup={() => {}} />);
  for (const found of [...board.latest().panels[0]!.parts, ...kits.kits().find((kit) => kit.id === 'saved')!.parts]) {
    renderOwned(() => <PartView kind={found.kind} span={found.span} session={session} onPopup={() => {}} />);
  }

  setBrush((brush) => ({ ...brush, color: '#0000ff' }));
  flush();
  expect(document.querySelectorAll('[aria-label^="Missing part:"]')).toHaveLength(4);
  expect((document.querySelector('[aria-label="Foreground color"]') as HTMLElement).style.background).toBe(
    'rgb(0, 0, 255)'
  );
});

/** Runs reactive factories in a disposed test owner. */
function owned<T>(create: () => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return create();
  });
}

function renderOwned(view: Parameters<typeof render>[0]) {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(view, host));
  flush();
}

/** Dispatches pointer events with capture mocked, then settles controlled updates. */
function pointer(target: HTMLElement, type: string, x: number) {
  target.setPointerCapture = vi.fn();
  const event = new MouseEvent(type, { clientX: x, clientY: 0, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'pen' } });
  target.dispatchEvent(event);
  flush();
}

function fakeSession() {
  const [brush, setBrush] = createSignal({ ...defaultBrush(), color: '#ff0000' });
  const session = {
    brush,
    tool: () => 'brush',
    tools: {
      preset: () => '',
      updateBrush: vi.fn((patch) => setBrush((current) => ({ ...current, ...patch }))),
      swapColors: vi.fn()
    },
    library: { presets: () => [] },
    engine: { state: () => ({ canUndo: true, canRedo: true }) },
    ready: () => true,
    setError: vi.fn()
  } as unknown as Session;
  return { session, setBrush };
}
