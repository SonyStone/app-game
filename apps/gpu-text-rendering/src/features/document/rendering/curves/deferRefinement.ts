/**
 * Yields to browser events between bounded GPU batches without nested setTimeout's delay.
 * Each instance owns one pending callback; cancel/dispose also invalidate already posted messages.
 */
export function deferRefinement(run: () => void) {
  const channel = new MessageChannel();
  let generation = 0;
  let queued = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  channel.port1.onmessage = (event: MessageEvent<number>) => {
    if (disposed || !queued || event.data !== generation) {
      return;
    }

    queued = false;
    run();
  };

  return {
    schedule(delay: number) {
      if (queued || disposed) {
        return;
      }

      queued = true;
      const ticket = ++generation;
      if (delay > 0) {
        timer = setTimeout(() => channel.port2.postMessage(ticket), delay);
      } else {
        channel.port2.postMessage(ticket);
      }
    },
    cancel,
    destroy() {
      disposed = true;
      cancel();
      channel.port1.close();
      channel.port2.close();
    }
  };

  function cancel() {
    clearTimeout(timer);
    queued = false;
    generation++;
  }
}
