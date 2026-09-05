import type { AgentCommands, AgentSnapshot, PushedStatus } from './protocol';

/** Identifies one document instance. URLs are labels, never capture identities. */
export interface FrameTarget {
  readonly documentId: string;
  readonly frameId: number;
  readonly url: string;
  readonly isTop: boolean;
}

/** Transport used by the Solid session; production and tests share this interface. */
export interface AgentClient {
  listFrames(): Promise<readonly FrameTarget[]>;
  inspect(target: FrameTarget): Promise<AgentSnapshot>;
  call<K extends keyof AgentCommands>(
    target: FrameTarget,
    method: K,
    ...args: Parameters<AgentCommands[K]>
  ): Promise<ReturnType<AgentCommands[K]>>;
  /** Listens until the returned cleanup runs, including after worker reconnection. */
  subscribe(onStatus: (status: PushedStatus) => void, onNavigated: () => void): () => void;
}
