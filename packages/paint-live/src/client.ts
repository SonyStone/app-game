import { addressFrame, readFromPeer, type RelayNotice, type Role, type Target } from './envelope';

/**
 * A browser's connection to a live room on the relay at `url`, as the author or a viewer. It reconnects on its own when
 * the connection drops, as it does when a Vercel Function reaches its maximum duration, waiting longer after each
 * failed attempt, up to {@link maxRetryMs}; every new connection gets a `welcome` notice again, after which the author
 * should send the drawing anew and a viewer expect it. A refused connection does not retry.
 *
 * The author sends payloads to every viewer or to one (`target`), and receives viewers' payloads with their peer id; a
 * viewer sends payloads to the author, and receives the author's. Payloads are bytes the application encodes.
 */
export function openLiveConnection(options: {
  /** The relay's WebSocket URL, such as `ws://localhost:3121` or `wss://example.com/api/server`. */
  url: string;
  room: string;
  role: Role;
  /** The author's key of the room, which later author connections must repeat; see `Relay.admit`. */
  key?: string;
  onNotice: (notice: RelayNotice) => void;
  /** A payload arrived: from the author for a viewer, or from the viewer `peer` for the author. */
  onPayload: (payload: Uint8Array, peer?: string) => void;
  onStatus?: (status: LiveStatus) => void;
}) {
  let socket: WebSocket | undefined;
  let closed = false;
  let retryMs = firstRetryMs;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    const url = new URL(options.url);
    url.searchParams.set('room', options.room);
    url.searchParams.set('role', options.role);
    if (options.key) {
      url.searchParams.set('key', options.key);
    }

    options.onStatus?.('connecting');
    const next = new WebSocket(url);
    next.binaryType = 'arraybuffer';
    let refused = false;
    next.addEventListener('open', () => {
      retryMs = firstRetryMs;
      options.onStatus?.('open');
    });
    next.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        const notice = JSON.parse(event.data) as RelayNotice;
        options.onNotice(notice);
        if (notice.type === 'refused') {
          // A refused connection would be refused again; it ends here.
          refused = true;
          next.close();
        }

        return;
      }

      const bytes = new Uint8Array(event.data as ArrayBuffer);
      if (options.role === 'author') {
        const { peer, payload } = readFromPeer(bytes);
        options.onPayload(payload, peer);
      } else {
        options.onPayload(bytes);
      }
    });
    next.addEventListener('close', () => {
      if (socket !== next) {
        return;
      }

      socket = undefined;
      if (closed || refused) {
        options.onStatus?.('closed');
        return;
      }

      options.onStatus?.('connecting');
      retry = setTimeout(connect, retryMs);
      retryMs = Math.min(maxRetryMs, retryMs * 2);
    });
    socket = next;
  };
  connect();

  return {
    /**
     * Sends `payload`: the author to `target`, every viewer by default; a viewer to the author. Returns false while
     * disconnected, when the payload is dropped; the next `welcome` tells when sending works again.
     */
    send(payload: Uint8Array, target: Target = { kind: 'viewers' }) {
      if (socket?.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send((options.role === 'author' ? addressFrame(target, payload) : payload) as Uint8Array<ArrayBuffer>);
      return true;
    },
    /** Bytes waiting to be sent, for backing off while the network is slow. */
    buffered: () => socket?.bufferedAmount ?? 0,
    /** Closes the connection for good. */
    close() {
      closed = true;
      clearTimeout(retry);
      socket?.close();
      options.onStatus?.('closed');
    }
  };
}

/** A live connection; see {@link openLiveConnection}. */
export type LiveConnection = ReturnType<typeof openLiveConnection>;

/** Whether a live connection is reaching the relay, connected, or closed for good. */
export type LiveStatus = 'connecting' | 'open' | 'closed';

/** Milliseconds before the first retry and at most between retries. */
const firstRetryMs = 500;
const maxRetryMs = 10_000;
