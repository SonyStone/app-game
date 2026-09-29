/**
 * Resolves after pending browser events and tasks have had a turn, without nested `setTimeout`'s clamping.
 *
 * All callers share one lazily created `MessageChannel`; concurrent yields resolve in request order.
 * Nothing can be cancelled: callers re-check their own lifetime after awaiting.
 */
export function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    waiting.push(resolve);
    channel ??= createChannel();
    channel.port2.postMessage(undefined);
  });
}

/** Resolvers in request order; each posted message releases exactly one. */
const waiting: (() => void)[] = [];
let channel: MessageChannel | undefined;

function createChannel() {
  const created = new MessageChannel();
  created.port1.onmessage = () => waiting.shift()?.();
  return created;
}
