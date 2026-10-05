import { TILE_SIZE } from '@app-game/paint-core/brush';
import { screenToWorld, type Camera, type Point, type ViewSize } from '@app-game/paint-core/camera';
import type { DocumentRect } from '@app-game/paint-core/layersInView';
import type { LiveListing, LiveState, LiveTileBytes } from '@app-game/paint-core/liveDrawing';
import { openLiveConnection, type LiveConnection, type LiveStatus } from '@app-game/paint-live/client';
import type { RelayNotice } from '@app-game/paint-live/envelope';
import type { Result } from 'neverthrow';
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import type { PaintError } from '../../shared/errors';
import { decodeLiveMessage, encodeLiveMessage, type LiveMessage } from './liveMessages';

/**
 * Broadcasts the drawing to viewers of a live room while `start`ed: the author's view, pointer and, for the area around
 * the view, the drawing itself. Each viewer is sent only tile versions it lacks: after every change of the document,
 * the view or the viewers, the engine lists the versions there (`list`), and those a viewer has not got are read
 * (`read`) and sent to it in parts of about {@link partBytes}, waiting while the connection is backed up. Viewers announce
 * themselves with `hello` when they connect, and when the author asks after its own connection came back; an announced
 * viewer starts from nothing.
 *
 * The room and its key stay in `localStorage` until `stop`, so a reload keeps broadcasting to the same room. Must be
 * created within a Solid owner, which closes the connection on disposal.
 */
export function createLiveBroadcast(options: {
  /** The relay's WebSocket URL; see `liveRelayUrl`. */
  url: string;
  list: (region: DocumentRect, limit: number) => Promise<Result<LiveListing, PaintError>>;
  read: (versions: string[]) => Promise<Result<LiveTileBytes[], PaintError>>;
  /** Changes whenever the document does; see the engine state's `revision`. */
  revision: Accessor<number>;
  camera: Accessor<Camera>;
  size: Accessor<ViewSize>;
  /** The pen or mouse over the canvas in document pixels, and whether it touches; `undefined` off the canvas. */
  pointer: Accessor<{ point: Point; contact: boolean } | undefined>;
  /** Brush diameter in document pixels, for the pointer viewers see. */
  brushSize: Accessor<number>;
  /** Whether the engine can list and read tiles. */
  ready: Accessor<boolean>;
}) {
  const [session, setSession] = createSignal<{ room: string; key: string } | undefined>(readSession());
  const [status, setStatus] = createSignal<LiveStatus>('closed');
  const [viewers, setViewers] = createSignal(0);
  const [error, setError] = createSignal<string>();
  /** Tile versions each viewer has, by `layerId/key`, and the layers it was last sent, as JSON. */
  const sent = new Map<string, { tiles: Map<string, string>; layers: string }>();
  let connection: LiveConnection | undefined;
  /** A sync runs at a time; one asked for meanwhile runs after it. */
  let syncing: Promise<void> | undefined;
  let again = false;

  createEffect(session, (current) => {
    if (!current) {
      return;
    }

    sent.clear();
    setError(undefined);
    connection = openLiveConnection({
      url: options.url,
      room: current.room,
      role: 'author',
      key: current.key,
      onStatus: setStatus,
      onNotice: receive,
      onPayload(payload, peer) {
        if (peer && decodeLiveMessage(payload).type === 'hello') {
          sent.set(peer, { tiles: new Map(), layers: '' });
          requestSync();
          sendView();
        }
      }
    });
    return () => {
      connection?.close();
      connection = undefined;
      setStatus('closed');
      setViewers(0);
    };
  });

  // The drawing follows the document and the view; the view and the pointer follow at their own pace.
  createEffect(
    () => (session() && options.ready() ? [options.revision(), options.camera(), options.size()] : undefined),
    (changed) => {
      if (changed) {
        const timer = setTimeout(requestSync, syncDelayMs);
        return () => clearTimeout(timer);
      }
    }
  );
  createEffect(
    () => (session() ? { camera: options.camera(), size: options.size() } : undefined),
    (view) => {
      if (view) {
        broadcast({ type: 'view', ...view });
      }
    }
  );
  createEffect(
    () => (session() ? { pointer: options.pointer(), size: options.brushSize() } : undefined),
    (state) => {
      if (state) {
        broadcast({
          type: 'pointer',
          point: state.pointer?.point ?? null,
          contact: state.pointer?.contact ?? false,
          size: state.size
        });
      }
    }
  );
  onCleanup(() => connection?.close());

  return {
    /** The room being broadcast to, and the link viewers open; `undefined` while not live. */
    session,
    status,
    /** How many watch now. */
    viewers,
    /** Why the relay refused the room, if it did. */
    error,
    /** Starts broadcasting to a new room. */
    start() {
      const next = { room: randomId(12), key: randomId(24) };
      writeSession(next);
      setSession(next);
    },
    /** Stops broadcasting and forgets the room. */
    stop() {
      writeSession(undefined);
      setSession(undefined);
    }
  };

  function receive(notice: RelayNotice) {
    if (notice.type === 'welcome') {
      // A new connection: viewers may have missed changes, so they announce themselves and start from nothing.
      sent.clear();
      setViewers(notice.viewers);
      broadcast({ type: 'hello' });
    } else if (notice.type === 'viewers') {
      setViewers(notice.count);
    } else if (notice.type === 'left') {
      sent.delete(notice.peer);
    } else if (notice.type === 'refused') {
      setError(notice.reason);
      writeSession(undefined);
    }
  }

  function sendView() {
    const camera = untrack(options.camera),
      size = untrack(options.size);
    broadcast({ type: 'view', camera, size });
  }

  function broadcast(message: LiveMessage) {
    connection?.send(encodeLiveMessage(message));
  }

  function requestSync() {
    if (syncing) {
      again = true;
      return;
    }

    syncing = sync().finally(() => {
      syncing = undefined;
      if (again) {
        again = false;
        requestSync();
      }
    });
  }

  /** Sends every viewer the tiles around the view that it lacks, and tiles it has there that are gone. */
  async function sync() {
    if (!connection || !sent.size || !untrack(options.ready)) {
      return;
    }

    const region = viewRegion(untrack(options.camera), untrack(options.size));
    const listed = await options.list(region, maxTiles);
    if (listed.isErr()) {
      return;
    }

    const listing = listed.value;
    const layers = JSON.stringify(listing.layers);
    const current = new Map(listing.tiles.map((tile) => [`${tile.layerId}/${tile.key}`, tile]));
    const wanted = new Set<string>();
    for (const viewer of sent.values()) {
      for (const [id, tile] of current) {
        if (viewer.tiles.get(id) !== tile.version) {
          wanted.add(tile.version);
        }
      }
    }

    const read = wanted.size ? await options.read([...wanted]) : undefined;
    if (read?.isErr()) {
      return;
    }

    const bytes = new Map<string, Uint8Array>(
      (read?.isOk() ? read.value : []).map((tile) => [tile.version, tile.bytes])
    );
    for (const [peer, viewer] of sent) {
      const tiles: LiveState['tiles'] = [];
      for (const [id, tile] of current) {
        const data = bytes.get(tile.version);
        if (viewer.tiles.get(id) !== tile.version && data) {
          tiles.push({ layerId: tile.layerId, key: tile.key, bytes: data });
          viewer.tiles.set(id, tile.version);
        }
      }

      // Tiles the viewer has in the region that the drawing no longer has there.
      for (const id of viewer.tiles.keys()) {
        const [layerId, key] = splitId(id);
        if (!current.has(id) && inRegion(key, region)) {
          tiles.push({ layerId, key, bytes: null });
          viewer.tiles.delete(id);
        }
      }

      if (!tiles.length && viewer.layers === layers) {
        continue;
      }

      viewer.layers = layers;
      const state = { layers: listing.layers, activeId: listing.activeId, linearBlending: listing.linearBlending };
      for (const part of parts(tiles)) {
        while (connection && connection.buffered() > maxBufferedBytes) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        connection?.send(encodeLiveMessage({ type: 'drawing', ...state, tiles: part }), { kind: 'peer', peer });
      }
    }
  }
}

/** The live broadcast; see {@link createLiveBroadcast}. */
export type LiveBroadcast = ReturnType<typeof createLiveBroadcast>;

/** The document area the view shows, grown by a quarter on each side, in document pixels. */
export function viewRegion(camera: Camera, size: ViewSize): DocumentRect {
  const corners = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: 0, y: size.height },
    { x: size.width, y: size.height }
  ].map((corner) => screenToWorld(corner, camera, size));
  const left = Math.min(...corners.map(({ x }) => x)),
    right = Math.max(...corners.map(({ x }) => x)),
    top = Math.min(...corners.map(({ y }) => y)),
    bottom = Math.max(...corners.map(({ y }) => y));
  const marginX = (right - left) / 4,
    marginY = (bottom - top) / 4;
  return {
    left: left - marginX,
    top: top - marginY,
    width: right - left + 2 * marginX,
    height: bottom - top + 2 * marginY
  };
}

/** Splits tiles into parts of about {@link partBytes}, each of at least one tile. */
function parts(tiles: LiveState['tiles']) {
  const result: LiveState['tiles'][] = [];
  let part: LiveState['tiles'] = [];
  let bytes = 0;
  for (const tile of tiles) {
    if (part.length && bytes + (tile.bytes?.byteLength ?? 0) > partBytes) {
      result.push(part);
      part = [];
      bytes = 0;
    }

    part.push(tile);
    bytes += tile.bytes?.byteLength ?? 0;
  }

  if (part.length || !result.length) {
    result.push(part);
  }

  return result;
}

function splitId(id: string): [string, string] {
  const slash = id.lastIndexOf('/');
  return [id.slice(0, slash), id.slice(slash + 1)];
}

function inRegion(key: string, region: DocumentRect) {
  const [x, y] = key.split(',').map(Number) as [number, number];
  return (
    (x + 1) * TILE_SIZE > region.left &&
    x * TILE_SIZE < region.left + region.width &&
    (y + 1) * TILE_SIZE > region.top &&
    y * TILE_SIZE < region.top + region.height
  );
}

function randomId(length: number) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(length))].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function readSession(): { room: string; key: string } | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { room?: unknown; key?: unknown } | null;
    return typeof value?.room === 'string' && typeof value.key === 'string'
      ? { room: value.room, key: value.key }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(value: { room: string; key: string } | undefined) {
  try {
    if (value) {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Without storage a reload ends the broadcast.
  }
}

const storageKey = 'paint.live';

/** Most tiles a sync lists around the view. */
const maxTiles = 1500;

/** Milliseconds a sync waits for changes to settle. */
const syncDelayMs = 150;

/** Bytes of tiles in one message, and bytes waiting in the connection before a sync waits. */
const partBytes = 2 * 1024 * 1024;
const maxBufferedBytes = 8 * 1024 * 1024;
