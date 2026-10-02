import { cn } from '@app-game/utils/cn';
import { createIntervalCounter } from '@solid-primitives/timer';
import type { JSX } from '@solidjs/web';
import type { DockState } from 'solid-dock';
import { createSignal, For } from 'solid-js';

/*
 * Panel contents with local state: selection, scroll, text, counters and a canvas.
 * A remount would reset all of it, so they show that moving a tab keeps the panel
 * alive. Colours derive from the inherited text colour, so every theme can host them.
 */

/** Scrollable file list with a selected row. */
export function FilesPanel(): JSX.Element {
  const [selected, setSelected] = createSignal(FILES[3]);

  return (
    <ul class="flex flex-col py-1 text-[13px]">
      <For each={FILES}>
        {(file) => (
          <li>
            <div
              role="button"
              tabindex="0"
              class={cn(
                'flex w-full cursor-default items-center gap-2 px-3 py-1 whitespace-nowrap transition-colors',
                selected() === file ? 'bg-sky-500/20' : 'hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]'
              )}
              onClick={() => setSelected(file)}
            >
              <FileBadge name={file} />
              <span class="truncate">{file}</span>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

const FILES = Array.from({ length: 36 }, (_, index) => {
  const names = ['Dock.tsx', 'state.ts', 'geometry.ts', 'createDock.ts', 'index.ts', 'README.md'];
  return index < names.length ? names[index] : `component-${index - names.length + 1}.tsx`;
});

/** Coloured two-letter badge derived from a file extension. */
export function FileBadge(props: { name: string }): JSX.Element {
  const kind = () => props.name.split('.').pop() ?? '';

  return (
    <span
      class={cn(
        'w-6 shrink-0 text-center font-mono text-[10px] font-bold',
        kind() === 'tsx' && 'text-sky-500',
        kind() === 'ts' && 'text-blue-500',
        kind() === 'md' && 'text-amber-500',
        kind() === 'json' && 'text-yellow-500',
        kind() === 'css' && 'text-violet-500',
        kind() === 'html' && 'text-orange-500'
      )}
    >
      {kind() === 'tsx' ? 'TSX' : kind().toUpperCase()}
    </span>
  );
}

/** Free-form text area. `onEdit` fires on every edit. */
export function NotesPanel(props: { onEdit?: () => void }): JSX.Element {
  return (
    <textarea
      class="block h-full w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-current outline-none placeholder:text-current placeholder:opacity-45"
      placeholder="Type here, then drag this tab to another group: the text stays."
      onInput={() => props.onEdit?.()}
    />
  );
}

/** Counter plus the time since mount, which resets only if the panel remounts. */
export function CounterPanel(): JSX.Element {
  const [count, setCount] = createSignal(0);
  const seconds = createIntervalCounter(1000);

  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <span class="text-5xl font-semibold tabular-nums">{count()}</span>
      <div class="flex gap-2">
        <PanelButton onClick={() => setCount((value) => value - 1)}>−1</PanelButton>
        <PanelButton onClick={() => setCount((value) => value + 1)}>+1</PanelButton>
      </div>
      <span class="text-xs opacity-60">mounted {formatDuration(seconds())} ago</span>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * Drawing canvas. Its backing size is fixed, so resizing the panel only scales
 * the picture instead of clearing it.
 */
export function SketchPanel(): JSX.Element {
  const [color, setColor] = createSignal(SKETCH_COLORS[0]);
  let canvas: HTMLCanvasElement | undefined;
  let last: { x: number; y: number } | undefined;

  function point(event: PointerEvent, target: HTMLCanvasElement): { x: number; y: number } {
    const rect = target.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * target.width) / rect.width,
      y: ((event.clientY - rect.top) * target.height) / rect.height
    };
  }

  function draw(event: PointerEvent): void {
    if (!last || !canvas) {
      return;
    }

    const next = point(event, canvas);
    const context = canvas.getContext('2d');
    if (context) {
      context.strokeStyle = color();
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(next.x, next.y);
      context.stroke();
    }
    last = next;
  }

  return (
    <div class="flex h-full flex-col">
      <div class="flex shrink-0 items-center gap-1.5 px-2 py-1.5">
        <For each={SKETCH_COLORS}>
          {(swatch) => (
            <button
              type="button"
              aria-label={`Colour ${swatch}`}
              class={cn('h-4 w-4 rounded-full', color() === swatch && 'ring-2 ring-current ring-offset-1')}
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
            />
          )}
        </For>
        <span class="ml-auto text-[11px] opacity-50">draw, then move the tab</span>
        <PanelButton onClick={() => canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)}>
          Clear
        </PanelButton>
      </div>
      <canvas
        ref={(element) => (canvas = element)}
        width={800}
        height={500}
        class="min-h-0 w-full flex-1 cursor-crosshair touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          last = point(event, event.currentTarget);
        }}
        onPointerMove={draw}
        onPointerUp={() => (last = undefined)}
        onPointerCancel={() => (last = undefined)}
      />
    </div>
  );
}

const SKETCH_COLORS = ['#0ea5e9', '#ec4899', '#f59e0b', '#22c55e'];

/** Live view of a dock layout store. */
export function LayoutJsonPanel(props: { state: DockState }): JSX.Element {
  return <pre class="p-3 font-mono text-[11px] leading-snug opacity-75">{JSON.stringify(props.state, null, 2)}</pre>;
}

/** Outlined button tinted by the inherited text colour. */
export function PanelButton(props: { onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      class="rounded-[6px] border border-[color-mix(in_srgb,currentColor_25%,transparent)] px-2.5 py-1 text-xs hover:!bg-[color-mix(in_srgb,currentColor_10%,transparent)]"
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

/**
 * An iframe: browsers reload it whenever it is recreated or even moved in the
 * DOM. Its instance id, load time and running counter prove that moving the tab,
 * resizing or switching designs never remounts the panel.
 */
export function InstanceProofPanel(): JSX.Element {
  return <iframe title="Instance proof" class="block h-full w-full border-0" srcdoc={INSTANCE_PROOF_HTML} />;
}

const INSTANCE_PROOF_HTML = `<!doctype html>
<html>
<head>
<style>
  :root { color-scheme: light dark; font: 13px system-ui, sans-serif; }
  body { margin: 0; height: 100vh; display: grid; place-content: center; gap: 10px; text-align: center; background: transparent; color: #8a8a8a; }
  b { color: CanvasText; font-size: 28px; font-variant-numeric: tabular-nums; }
  .id { font: 600 18px ui-monospace, monospace; padding: 4px 10px; border-radius: 6px; color: white; }
  .ball { width: 14px; height: 14px; border-radius: 50%; margin: 0 auto; animation: bounce 1.2s ease-in-out infinite alternate; }
  @keyframes bounce { from { transform: translateX(-60px); } to { transform: translateX(60px); } }
</style>
</head>
<body>
  <div>iframe instance</div>
  <div class="id" id="id"></div>
  <div class="ball" id="ball"></div>
  <div>alive for <b id="age">0.0</b> s</div>
  <div id="loaded"></div>
  <div>A remount or a DOM move reloads the iframe and resets all of this.</div>
<script>
  const id = Math.random().toString(16).slice(2, 8).toUpperCase();
  const hue = parseInt(id, 16) % 360;
  document.getElementById('id').textContent = '#' + id;
  document.getElementById('id').style.background = 'hsl(' + hue + ' 70% 45%)';
  document.getElementById('ball').style.background = 'hsl(' + hue + ' 70% 55%)';
  document.getElementById('loaded').textContent = 'loaded at ' + new Date().toLocaleTimeString();
  const start = performance.now();
  setInterval(() => { document.getElementById('age').textContent = ((performance.now() - start) / 1000).toFixed(1); }, 100);
</script>
</body>
</html>`;
