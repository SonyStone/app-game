import type { ICapture, IMeshCapture, ISceneCapture, ITextureCapture } from '@app-game/spector';

export const AGENT_KEY = '__APP_GAME_WEBGL_SPECTOR_DEVTOOLS__';
export const AGENT_VERSION = 28;
export const AGENT_STATUS_MESSAGE = 'app-game:webgl-spector-status';
export const DEVTOOLS_PORT_NAME = 'webgl-spector-devtools';

/** Serializable information about one DOM canvas in an inspected frame. */
export interface CanvasSnapshot {
  readonly id: number;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly context: 'WebGL 1' | 'WebGL 2' | 'Not observed';
  readonly visible: boolean;
}

/** Serializable state returned by the page-realm capture agent. */
export interface AgentSnapshot {
  readonly version: number;
  readonly documentTitle: string;
  readonly documentUrl: string;
  readonly canvases: readonly CanvasSnapshot[];
  readonly status:
    | { readonly type: 'idle' }
    | { readonly type: 'waiting'; readonly canvasId: number }
    | { readonly type: 'capturing'; readonly canvasId: number; readonly commandCount: number }
    | { readonly type: 'processing'; readonly canvasId: number; readonly commandCount: number }
    | { readonly type: 'captured'; readonly canvasId: number; readonly commandCount: number }
    | { readonly type: 'error'; readonly message: string };
  readonly statusRevision: number;
  readonly captureRevision: number;
}

/** Request sent to the inspected frame when starting a capture. */
export interface CaptureRequest {
  readonly canvasId: number;
  readonly commandCount: number;
}

/** JSON envelope used across the DevTools inspected-window boundary. */
export type AgentResponse<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** Typed values before the page agent wraps them in a JSON response. */
export interface AgentCommands {
  inspect(): AgentSnapshot;
  capture(request: CaptureRequest): void;
  stop(): boolean;
  readCapture(revision: number): string;
  readMesh(revision: number, commandId: number, attributeName?: string): IMeshCapture;
  readScene(revision: number): ISceneCapture;
  readTexture(revision: number, commandId: number, uniformIndex: number, textureIndex: number): ITextureCapture;
  compile(revision: number, programId: number, vertex: string, fragment: string): void;
}

/** Methods exposed in the page realm, all returning serialized response envelopes. */
export type PageAgent = {
  readonly version: number;
  dispose(): void;
} & { [K in keyof AgentCommands]: (...args: Parameters<AgentCommands[K]>) => string | Promise<string> };

/** Capture progress attributed by Chrome to its sending document. */
export interface PushedStatus {
  readonly type: 'webgl-spector-panel-status';
  readonly frameId: number;
  readonly documentId: string;
  readonly status: AgentSnapshot['status'];
  readonly statusRevision: number;
  readonly captureRevision: number;
}

/** Rejects malformed page values before they enter reactive session state. */
export function isAgentSnapshot(value: unknown): value is AgentSnapshot {
  return (
    isRecord(value) &&
    typeof value.version === 'number' &&
    typeof value.documentUrl === 'string' &&
    typeof value.documentTitle === 'string' &&
    Array.isArray(value.canvases) &&
    value.canvases.every(isCanvasSnapshot) &&
    isCaptureStatus(value.status) &&
    isRevision(value.statusRevision) &&
    isRevision(value.captureRevision)
  );
}

/** Validates a worker message, including its browser-provided document identity. */
export function isPushedStatus(value: unknown): value is PushedStatus {
  return (
    isRecord(value) &&
    value.type === 'webgl-spector-panel-status' &&
    Number.isInteger(value.frameId) &&
    typeof value.documentId === 'string' &&
    isCaptureStatus(value.status) &&
    isRevision(value.statusRevision) &&
    isRevision(value.captureRevision)
  );
}

/** Shared by both sides of the isolated status bridge. */
export function isAgentStatus(
  value: unknown
): value is Pick<PushedStatus, 'status' | 'statusRevision' | 'captureRevision'> & { type: string } {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    isCaptureStatus(value.status) &&
    isRevision(value.statusRevision) &&
    isRevision(value.captureRevision)
  );
}

/** Checks the capture fields consumed by the result viewer. */
export function isCapture(value: unknown): value is ICapture {
  return (
    isRecord(value) &&
    Array.isArray(value.commands) &&
    isRecord(value.canvas) &&
    isRecord(value.context) &&
    isRecord(value.initState) &&
    isRecord(value.endState)
  );
}

/** Decodes a response or throws the page agent's error. */
export function unwrapAgentResponse<T>(value: unknown): T {
  if (typeof value !== 'string') throw new Error('The Spector agent returned no response.');
  const response: unknown = JSON.parse(value);
  if (!isRecord(response) || typeof response.ok !== 'boolean')
    throw new Error('The Spector agent returned invalid data.');
  if (!response.ok)
    throw new Error(typeof response.error === 'string' ? response.error : 'The page rejected the request.');
  return response.value as T;
}

function isCaptureStatus(value: unknown): value is AgentSnapshot['status'] {
  if (!isRecord(value)) return false;
  if (value.type === 'idle') return true;
  if (value.type === 'error') return typeof value.message === 'string';
  if (value.type === 'waiting') return Number.isInteger(value.canvasId);
  return (
    (value.type === 'capturing' || value.type === 'processing' || value.type === 'captured') &&
    Number.isInteger(value.canvasId) &&
    isRevision(value.commandCount)
  );
}

function isCanvasSnapshot(value: unknown): value is CanvasSnapshot {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    typeof value.label === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.clientWidth === 'number' &&
    typeof value.clientHeight === 'number' &&
    typeof value.visible === 'boolean' &&
    (value.context === 'WebGL 1' || value.context === 'WebGL 2' || value.context === 'Not observed')
  );
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
