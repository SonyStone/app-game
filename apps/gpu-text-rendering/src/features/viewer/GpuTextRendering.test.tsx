import { render, type JSX } from '@solidjs/web';
import { err, ok, type Result } from 'neverthrow';
import { flush, onCleanup } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { documentError, gpuError, type DocumentError, type GpuError } from '../../shared/errors';
import { runWorkerRequest } from '../../shared/worker/runWorkerRequest';
import type { DecodedDocument } from '../document/format/types';
import type { DocumentRendererProvider } from '../document/rendering/DocumentRendererProvider';
import type { ViewerStatus } from './createViewerStatus';
import GpuTextRendering from './GpuTextRendering';

vi.mock('../../shared/worker/runWorkerRequest', () => ({ runWorkerRequest: vi.fn() }));
let gpuFailure: GpuError | undefined;
let failGpu!: (error: GpuError) => JSX.Element;
vi.mock('../../shared/gpu/TypeGPURootProvider', () => ({
  TypeGPURootProvider: (props: { error: typeof failGpu; children: JSX.Element }) => {
    failGpu = props.error;
    return gpuFailure ? props.error(gpuFailure) : props.children;
  }
}));
vi.mock('../../shared/gpu/GpuCanvasProvider', () => ({
  GpuCanvasProvider: (props: { children: JSX.Element }) => props.children
}));
vi.mock('../viewport/Viewport', () => ({ Viewport: (props: { children: JSX.Element }) => props.children }));
vi.mock('../camera/DocumentCamera', () => ({ DocumentCamera: (props: { children: JSX.Element }) => props.children }));
vi.mock('../camera/SceneSpace', () => ({ DocumentSpace: (props: { children: JSX.Element }) => props.children }));
vi.mock('../camera/CameraControls', () => ({ CameraControls: () => null }));
vi.mock('../camera/CameraTour', () => ({ CameraTour: () => null }));
vi.mock('../camera/OverviewCamera', () => ({ OverviewCamera: () => null }));
vi.mock('../scene/FrameLoop', () => ({
  FrameLoop: (props: {
    onError: (error: GpuError) => void;
    children: (loop: { fail: (error: GpuError) => void }) => JSX.Element;
  }) => props.children({ fail: (error) => props.onError(error) })
}));
type RendererProps = Parameters<typeof DocumentRendererProvider>[0];
const preparations: RendererProps[] = [];
const released = vi.fn();
vi.mock('../document/rendering/DocumentRendererProvider', () => ({
  DocumentRendererProvider: (props: RendererProps) => {
    preparations.push(props);
    onCleanup(() => released(props));
    return null;
  }
}));
vi.mock('@app-game/components/ui/button', () => ({
  Button: (props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />
}));
vi.mock('@app-game/components/ui/dropdown-menu', () => {
  const container = (props: { children?: JSX.Element }) => <div>{props.children}</div>;
  const item = (props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { checked?: boolean }) => (
    <button onClick={props.onClick} disabled={props.disabled} aria-checked={props.checked ? 'true' : 'false'}>
      {props.children}
    </button>
  );
  return {
    DropdownMenu: container,
    DropdownMenuContent: container,
    DropdownMenuTrigger: container,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: item,
    DropdownMenuCheckboxItem: item
  };
});
vi.mock('./LanguageMenu', () => ({
  LanguageMenu: (props: { children: (item: JSX.Element) => JSX.Element }) => props.children(null)
}));
vi.mock('./i18n/createViewerI18n', () => ({
  createViewerI18n: () => ({
    locale: () => 'en',
    direction: () => 'ltr',
    t: (key: string) => key,
    status: (status: ViewerStatus) =>
      status.phase === 'ready' ? `ready ${status.preparationMs}ms ${status.resourceBytes}bytes` : status.phase
  })
}));
let open!: (file?: File) => void;
vi.mock('./DocumentPicker', () => ({
  DocumentPicker: (props: { onOpen: typeof open }) => {
    open = props.onOpen;
    return null;
  }
}));

const cleanups: (() => void)[] = [];
let decode = () => Promise.resolve(ok(scene()) as Result<DecodedDocument, DocumentError>);
beforeEach(() => {
  gpuFailure = undefined;
  preparations.length = 0;
  released.mockClear();
  decode = () => Promise.resolve(ok(scene()));
  vi.mocked(runWorkerRequest).mockImplementation(() => decode());
});
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

it('derives the profile and replaces the scene when opening the same file again', async () => {
  const host = mount();
  await vi.waitFor(() => expect(button(host, 'grids')).toBeDefined());
  const autoZoom = button(host, 'autoZoom')!;
  autoZoom.click();
  flush();
  expect(autoZoom.getAttribute('aria-checked')).toBe('true');
  const file = new File(['%PDF-1.7'], 'document.pdf');
  decode = () => Promise.resolve(ok(curves()));
  open(file);
  await vi.waitFor(() => expect(button(host, 'download')).toBeDefined());
  expect(autoZoom.getAttribute('aria-checked')).toBe('false');
  expect(button(host, 'grids')).toBeUndefined();
  autoZoom.click();
  flush();
  expect(autoZoom.getAttribute('aria-checked')).toBe('true');
  await vi.waitFor(() => expect(preparations).toHaveLength(2));
  const previous = preparations[1]!;
  open(file);
  flush();
  expect(autoZoom.getAttribute('aria-checked')).toBe('false');
  expect(released).toHaveBeenCalledWith(previous);
  await vi.waitFor(() => expect(preparations).toHaveLength(3));
  expect(preparations[2]!.document).not.toBe(previous.document);
});

it('does not offer the previous PDF export while its replacement is loading', async () => {
  const host = mount();
  await vi.waitFor(() => expect(button(host, 'grids')).toBeDefined());
  open(new File(['%PDF-1.7'], 'document.pdf'));
  await vi.waitFor(() => expect(button(host, 'download')).toBeDefined());
  let finish!: (result: Result<DecodedDocument, DocumentError>) => void;
  decode = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  open(new File(['GDOC\r\n\x1a\n'], 'replacement.gdoc'));
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(button(host, 'download')).toBeUndefined();
  finish(ok(scene()));
  await vi.waitFor(() => expect(button(host, 'grids')).toBeDefined());
  expect(button(host, 'download')).toBeUndefined();
});

it('shows progress and cancellation while loading and ignores a cancelled result', async () => {
  let finish!: (value: Result<DecodedDocument, DocumentError>) => void;
  decode = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const host = mount();
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(host.querySelector('[data-testid="document-loading"]')).not.toBeNull();
  expect(host.querySelector('canvas')?.getAttribute('aria-busy')).toBe('true');
  host.querySelector<HTMLButtonElement>('button[aria-label="cancelLoading"]')!.click();
  flush();
  expect(statusText(host)).toBe('cancelled');
  expect(host.querySelector('[data-testid="document-loading"]')).toBeNull();
  finish(ok(scene()));
  await settle();
  expect(statusText(host)).toBe('cancelled');
  expect(preparations).toHaveLength(0);
  decode = () => Promise.resolve(ok(scene()));
  open();
  await vi.waitFor(() => expect(preparations).toHaveLength(1));
  expect(statusText(host)).toBe('preparing');
});

it('shows a dismissible fullscreen failure while a document is still loading', async () => {
  decode = () => new Promise(() => {});
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  HTMLElement.prototype.requestFullscreen = vi.fn(() => Promise.reject(new Error('Fullscreen denied')));
  try {
    const host = mount();
    await vi.waitFor(() => expect(host.querySelector('[data-testid="document-loading"]')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('button[aria-label="enterFullscreen"]')!.click();
    await vi.waitFor(() => expect(notice(host)?.textContent).toContain('Fullscreen denied'));
    expect(notice(host)?.textContent).toContain('fullscreenError');
    notice(host)!.querySelector<HTMLButtonElement>('button[aria-label="dismiss"]')!.click();
    flush();
    expect(notice(host)).toBeNull();
    expect(host.querySelector('[data-testid="document-loading"]')).not.toBeNull();
  } finally {
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
    Reflect.deleteProperty(document, 'fullscreenEnabled');
  }
});

it('retains GPU failure after decoding and selecting a replacement', async () => {
  gpuFailure = gpuError('unavailable', 'GPU unavailable');
  const host = mount();
  await vi.waitFor(() => expect(button(host, 'grids')).toBeDefined());
  expect(statusText(host)).toBe('error');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('GPU unavailable');
  expect(host.querySelector('canvas')?.getAttribute('aria-busy')).toBe('false');
  open(new File(['GDOC\r\n\x1a\n'], 'replacement.gdoc'));
  await settle();
  expect(statusText(host)).toBe('error');
});

it('shows source errors and recovers when a new document is selected', async () => {
  decode = () => Promise.resolve(err(documentError('decode', 'Invalid document')));
  const host = mount();
  await vi.waitFor(() => expect(statusText(host)).toBe('error'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Invalid document');
  decode = () => Promise.resolve(ok(scene()));
  open();
  await vi.waitFor(() => expect(preparations).toHaveLength(1));
  expect(statusText(host)).toBe('preparing');
});

it('hides the loading panel when ready and retains preparation time after residency changes', async () => {
  const host = mount();
  await vi.waitFor(() => expect(preparations).toHaveLength(1));
  expect(statusText(host)).toBe('preparing');
  preparations[0]!.onReady!({ preparationMs: 12, resourceBytes: 1024 });
  flush();
  expect(statusText(host)).toBe('ready 12ms 1024bytes');
  expect(host.querySelector('[data-testid="document-loading"]')).toBeNull();
  expect(host.querySelector('button[aria-label="cancelLoading"]')).toBeNull();
  preparations[0]!.onResourceUsage!(2048);
  flush();
  expect(statusText(host)).toBe('ready 12ms 2048bytes');
  failGpu(gpuError('lost', 'Device lost'));
  preparations[0]!.onResourceUsage!(4096);
  flush();
  expect(statusText(host)).toBe('error');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Device lost');
});

it('resets preparation and ignores old renderer callbacks after replacement', async () => {
  const host = mount();
  await vi.waitFor(() => expect(preparations).toHaveLength(1));
  const previous = preparations[0]!;
  previous.onReady!({ preparationMs: 12, resourceBytes: 1024 });
  flush();
  let finish!: (value: Result<DecodedDocument, DocumentError>) => void;
  decode = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  open();
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(released).toHaveBeenCalledWith(previous);
  previous.error(gpuError('validation', 'Obsolete renderer failure'));
  previous.onResourceUsage!(2048);
  previous.onReady!({ preparationMs: 99, resourceBytes: 4096 });
  flush();
  expect(statusText(host)).toBe('loading');
  finish(ok(scene()));
  await vi.waitFor(() => expect(preparations).toHaveLength(2));
  expect(statusText(host)).toBe('preparing');
  preparations[1]!.onReady!({ preparationMs: 25, resourceBytes: 512 });
  flush();
  expect(statusText(host)).toBe('ready 25ms 512bytes');
});

it('keeps cancellation and renderer errors terminal for the current preparation', async () => {
  const host = mount();
  await vi.waitFor(() => expect(preparations).toHaveLength(1));
  const cancelled = preparations[0]!;
  host.querySelector<HTMLButtonElement>('button[aria-label="cancelLoading"]')!.click();
  flush();
  cancelled.onReady!({ preparationMs: 12, resourceBytes: 1024 });
  flush();
  expect(statusText(host)).toBe('cancelled');
  open();
  await vi.waitFor(() => expect(preparations).toHaveLength(2));
  const failed = preparations[1]!;
  failed.error(gpuError('validation', 'Invalid GPU command'));
  flush();
  failed.onReady!({ preparationMs: 25, resourceBytes: 512 });
  flush();
  expect(statusText(host)).toBe('error');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Invalid GPU command');
});

function statusText(host: HTMLElement) {
  return host.querySelector('output[aria-live="polite"]')?.textContent;
}

async function settle() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    flush();
  }
}

function mount() {
  const host = document.createElement('div');
  cleanups.push(render(() => <GpuTextRendering />, host));
  return host;
}
function notice(host: HTMLElement) {
  return host.querySelector('[role="alert"]:has(button[aria-label="dismiss"])');
}
function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll('button')].find((button) => button.textContent === text);
}
function scene(): DecodedDocument {
  return {
    kind: 'glyphs',
    pages: [{ width: 612, height: 792, beginVertex: 0, endVertex: 6 }],
    positions: { x: new Float32Array(), y: new Float32Array() },
    glyphVertices: new ArrayBuffer(0),
    atlas: { buf: new ArrayBuffer(0), width: 1, height: 1 },
    atlasVertices: { buf: new ArrayBuffer(0), width: 1, height: 1 }
  };
}
function curves(): DecodedDocument {
  return {
    kind: 'curves',
    pages: scene().pages,
    positions: scene().positions,
    curves: new ArrayBuffer(0),
    instances: new ArrayBuffer(0),
    clips: new ArrayBuffer(0),
    curveBins: new ArrayBuffer(0),
    blends: new ArrayBuffer(0),
    groups: new ArrayBuffer(0),
    maskTransfers: new ArrayBuffer(0),
    radialGradients: new ArrayBuffer(0),
    rasterImages: { table: new ArrayBuffer(0), pixels: new ArrayBuffer(0) }
  };
}
