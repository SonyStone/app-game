import { render, type JSX } from '@solidjs/web';
import { onCleanup, onSettled } from 'solid-js';

/**
 * A still of what `render` draws: the component is mounted live inside this element, and once it has drawn, its
 * elements are copied, canvases with their pixels, and the live component is disposed. What stays is a picture with
 * the component's own markup and styles but none of its listeners. It has drawn once its markup has stopped changing
 * for a moment after something appeared, which waits out lazily loaded modules and opening animations; after
 * `timeout` milliseconds the still is taken as it is.
 *
 * For components that listen to the whole window, such as the Puck gallery's variants, which take keys and hover
 * wherever they come from: live on the canvas, they would react to typing in a comment and to the pen anywhere. Place
 * it in a `ScreenFrame` when the component covers the screen.
 */
export function Snapshot(props: { render: () => JSX.Element; timeout?: number }) {
  let host!: HTMLDivElement;
  let live: HTMLDivElement | undefined;
  let dispose: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    dispose?.();
    dispose = undefined;
    live?.remove();
    live = undefined;
  };
  onCleanup(stop);

  // A root of its own cannot start inside the canvas's reactive scope, so the live component mounts on the next task.
  onSettled(() => {
    timer = setTimeout(start, 0);
  });

  return <div ref={host} style={{ position: 'absolute', inset: '0' }} aria-hidden="true" />;

  function start() {
    live = document.createElement('div');
    live.className = host.className;
    live.style.cssText = 'position: absolute; inset: 0;';
    host.append(live);
    dispose = render(props.render, live);
    const started = performance.now();
    let last = '';
    const check = () => {
      if (!live) {
        return;
      }

      const markup = live.innerHTML;
      const settled = markup !== '' && markup === last;
      if (!settled && performance.now() - started < (props.timeout ?? defaultTimeoutMs)) {
        last = markup;
        timer = setTimeout(check, settleMs);
        return;
      }

      const still = live.cloneNode(true) as HTMLDivElement;
      copyCanvases(live, still);
      stop();
      host.append(still);
    };
    timer = setTimeout(check, settleMs);
  }
}

/** Copies the pixels of every canvas in `from` into its counterpart in `to`, a deep clone of `from`. */
function copyCanvases(from: Element, to: Element) {
  const sources = from.querySelectorAll('canvas');
  const copies = to.querySelectorAll('canvas');
  sources.forEach((source, index) => {
    const copy = copies[index];
    if (!copy || !source.width || !source.height) {
      return;
    }

    copy.width = source.width;
    copy.height = source.height;
    try {
      copy.getContext('2d')?.drawImage(source, 0, 0);
    } catch {
      // A canvas the page may not read stays blank.
    }
  });
}

/** How long the markup must stay the same to count as drawn: longer than the variants' opening animations. */
const settleMs = 400;
/** When the still is taken however the component is doing. */
const defaultTimeoutMs = 20_000;
