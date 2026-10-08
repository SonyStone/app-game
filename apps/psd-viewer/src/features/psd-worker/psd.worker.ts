/// <reference lib="webworker" />
import type { PsdRequest } from './protocol';
import { makePsdWorkerHost } from './workerHost';

// The PSD viewer module runs here, off the UI thread; see workerHost for the protocol.
const scope = self as unknown as DedicatedWorkerGlobalScope;
const host = makePsdWorkerHost((reply, transfer) => scope.postMessage(reply, transfer));
scope.onmessage = (event: MessageEvent<PsdRequest>) => {
  void host.receive(event.data);
};
