import type { Camera, Point, ViewSize } from '@app-game/paint-core/camera';
import type { LiveState } from '@app-game/paint-core/liveDrawing';
import { openLiveConnection, type LiveConnection, type LiveStatus } from '@app-game/paint-live/client';
import { createEffect, createSignal, type Accessor } from 'solid-js';
import { decodeLiveMessage, encodeLiveMessage } from './liveMessages';

/**
 * Watches the live room `room`: receives the author's drawing, view and pointer. The drawing's parts are applied in
 * order once the engine is `ready`, and kept until then. The viewer announces itself with `hello` whenever it connects
 * and whenever the author asks, so that the author sends it the drawing from the start. Must be created within a
 * Solid owner, which closes the connection on disposal.
 */
export function createLiveWatch(options: {
  /** The relay's WebSocket URL; see `liveRelayUrl`. */
  url: string;
  room: string;
  /** Whether the engine applies drawings now. */
  ready: Accessor<boolean>;
  /** Shows a part of the author's drawing; see the `live-apply` command. */
  apply: (state: LiveState) => void;
}) {
  const [status, setStatus] = createSignal<LiveStatus>('connecting');
  const [author, setAuthor] = createSignal(false);
  const [viewers, setViewers] = createSignal(0);
  const [view, setView] = createSignal<{ camera: Camera; size: ViewSize }>();
  const [pointer, setPointer] = createSignal<{ point: Point; contact: boolean; size: number }>();
  const [error, setError] = createSignal<string>();
  const waiting: LiveState[] = [];
  let connection: LiveConnection | undefined;
  const hello = () => connection?.send(encodeLiveMessage({ type: 'hello' }));
  // Opened in an effect: the connection reports its status at once, and a component may not write state as it runs.
  createEffect(
    () => options.room,
    (room) => {
      connection = open(room);
      return () => connection?.close();
    }
  );
  createEffect(options.ready, (ready) => {
    if (ready) {
      for (const state of waiting.splice(0)) {
        options.apply(state);
      }
    }
  });

  return {
    status,
    /** Whether the author is connected. */
    author,
    /** How many watch, this viewer included. */
    viewers,
    /** The author's camera and canvas size, which the viewer follows. */
    view,
    /** The author's pointer in document pixels, whether it touches, and the brush diameter; `undefined` off canvas. */
    pointer,
    /** Why the relay refused to let this viewer in, if it did. */
    error
  };

  function open(room: string) {
    return openLiveConnection({
      url: options.url,
      room,
      role: 'viewer',
      onStatus: setStatus,
      onNotice(notice) {
        if (notice.type === 'welcome') {
          setAuthor(notice.author);
          setViewers(notice.viewers);
          hello();
        } else if (notice.type === 'author') {
          setAuthor(notice.present);
        } else if (notice.type === 'viewers') {
          setViewers(notice.count);
        } else if (notice.type === 'refused') {
          setError(notice.reason);
        }
      },
      onPayload(payload) {
        const message = decodeLiveMessage(payload);
        if (message.type === 'drawing') {
          const state: LiveState = {
            layers: message.layers,
            activeId: message.activeId,
            linearBlending: message.linearBlending,
            tiles: message.tiles
          };
          if (options.ready()) {
            options.apply(state);
          } else {
            waiting.push(state);
          }
        } else if (message.type === 'view') {
          setView({ camera: message.camera, size: message.size });
        } else if (message.type === 'pointer') {
          setPointer(
            message.point ? { point: message.point, contact: message.contact, size: message.size } : undefined
          );
        } else {
          hello();
        }
      }
    });
  }
}

/** The camera that shows a viewer of `size` what the author's view shows: the same center, scaled to fit. */
export function followCamera(author: { camera: Camera; size: ViewSize }, size: ViewSize): Camera {
  const scale = Math.min(size.width / author.size.width, size.height / author.size.height);
  return { ...author.camera, zoom: author.camera.zoom * scale };
}
