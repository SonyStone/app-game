import { createBrushResources } from '@app-game/abr-paint/resources';
import { onTestFinished } from 'vitest';
import { abrBrush } from '../../src/composition/abrBrushEngine';
import { createAbrProcessor } from '../../src/composition/abrStrokeProcessor';
import type { PaintStorage, RendererFactory } from '../../src/composition/contracts';
import {
  BrushEngines,
  BrushResources,
  createPaintApplication,
  Document,
  PaintRuntime,
  Renderer,
  Storage,
  StrokeProcessor
} from '../../src/composition/PaintApplication';
import { roundBrush } from '../../src/composition/roundBrushEngine';
import { texturedBrush } from '../../src/composition/texturedBrushEngine';
import { createDocument } from '../../src/document';
import type { PaintCommand, PaintEvent } from '../../src/protocol';
import { studioProcessors } from '../../src/strokeProcessors';

/**
 * Mounts the same recipe as Paint Studio (paged document, stroke processors and every brush engine) with a renderer
 * and storage supplied by the test, and records the events it posts. The runtime is terminated when the test ends.
 *
 * `renderer` is either a ready double or a factory that also receives the device-loss callback and renderer options.
 */
export function startStudioRuntime(options: {
  renderer: object | ((...args: Parameters<RendererFactory>) => Promise<object>);
  storage: object;
}) {
  const events = createEventLog();
  const createRenderer = (
    typeof options.renderer === 'function' ? options.renderer : async () => options.renderer
  ) as RendererFactory;
  const createStorage = (async () => options.storage) as unknown as (name: string) => Promise<PaintStorage>;
  const application = createPaintApplication(
    (binding) => (
      <Document document={() => createDocument({ paged: true })}>
        <Storage storage={createStorage}>
          <Renderer renderer={createRenderer}>
            <StrokeProcessor
              processors={{ ...studioProcessors, abr: createAbrProcessor }}
              selectProcessor={(brush) =>
                brush.engine?.id === 'abr' && brush.stroke.mode !== 'none' ? 'abr' : brush.stroke.mode
              }
            >
              <BrushEngines
                engines={{
                  [roundBrush.id]: roundBrush.engine,
                  eraser: roundBrush.engine,
                  [texturedBrush.id]: texturedBrush.engine,
                  [abrBrush.id]: abrBrush.engine
                }}
                selectEngine={(brush) => (brush.tool === 'eraser' ? 'eraser' : 'round')}
              >
                <BrushResources resources={createBrushResources}>
                  <PaintRuntime {...binding} />
                </BrushResources>
              </BrushEngines>
            </StrokeProcessor>
          </Renderer>
        </Storage>
      </Document>
    ),
    events.push,
    () => {}
  );
  onTestFinished(() => application.terminate());

  return {
    /** Every event posted so far, in order; `next` consumes from the front. */
    events: events.all,
    send: (command: PaintCommand) => application.send(command),
    next: events.next,
    /** Sends `init` with a placeholder canvas and resolves on `ready`. */
    async init(extra: Partial<Extract<PaintCommand, { type: 'init' }>> = {}) {
      application.send({ type: 'init', canvas: {} as OffscreenCanvas, size: { width: 256, height: 256 }, dpr: 1, ...extra });
      await events.next((event) => event.type === 'ready');
    }
  };
}

/**
 * Resolves once `condition` holds, yielding only to already-queued microtasks, never to timers. Use it where the test
 * must prove work happens without a scheduled frame (fake timers stay frozen); prefer `next` when an event marks the
 * point. Rejects with `describe()` after `limit` microtask turns so a stuck runtime fails with context, not a timeout.
 */
export async function untilMicrotasks(condition: () => boolean, describe: () => string, limit = 500) {
  for (let turn = 0; turn < limit; turn++) {
    if (condition()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error(`Condition not reached after ${limit} microtask turns: ${describe()}`);
}

/**
 * Ordered event log with consuming waits. `next(matches)` resolves with the first matching event, dropping it and every
 * earlier event, so consecutive waits observe the runtime in order. A wait that no event satisfies within two seconds
 * of real time rejects with the unconsumed events, even while the test uses fake timers.
 */
function createEventLog() {
  const all: PaintEvent[] = [];
  let consumed = 0;
  const waiters = new Set<() => void>();

  return {
    all,
    push(event: PaintEvent) {
      all.push(event);
      waiters.forEach((wake) => wake());
    },
    next<Match extends PaintEvent = PaintEvent>(matches: (event: PaintEvent) => boolean) {
      return new Promise<Match>((resolve, reject) => {
        const check = () => {
          const index = all.findIndex((event, position) => position >= consumed && matches(event));

          if (index < 0) {
            return;
          }

          consumed = index + 1;
          settle();
          resolve(all[index] as Match);
        };
        const timeout = realSetTimeout(() => {
          settle();
          reject(new Error(`No matching paint event. Unconsumed: ${JSON.stringify(all.slice(consumed))}`));
        }, 2000);
        const settle = () => {
          realClearTimeout(timeout);
          waiters.delete(check);
        };

        waiters.add(check);
        check();
      });
    }
  };
}

// Captured at import, before a test installs fake timers, so wait deadlines measure real time.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
