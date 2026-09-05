import { CommandCaptureStatus, type ICommandCapture, type State } from '../shared/capture/commandCapture';

/** A framebuffer attachment emitted by Spector's visual-state recorder. */
export interface SpectorAttachment {
  readonly src?: string;
  readonly attachmentName?: string;
  readonly textureLayer?: string | number;
  readonly textureCubeMapFace?: string;
}

/** Normalized visual state used by the Solid framebuffer views. */
export interface SpectorVisualState {
  readonly attachments: readonly SpectorAttachment[];
  readonly framebufferLabel: string;
  readonly status?: string;
}

/** One visual-state checkpoint and the command that produced it. */
export interface SpectorVisualCheckpoint {
  readonly state: State;
  readonly commandIndex: number;
  readonly label: string;
}

/** Shader program information attached to draw-call commands. */
export interface SpectorShaderProgram {
  readonly programId: number;
  readonly editable: boolean;
  readonly vertex: SpectorShader;
  readonly fragment: SpectorShader;
}

/** Source and translated source for one captured shader stage. */
export interface SpectorShader {
  readonly name: string;
  readonly source: string;
  readonly translatedSource: string;
}

/** Returns commands matching a case-insensitive name, marker, log, or rendered-text query. */
export function filterCommands(commands: readonly ICommandCapture[], query: string): readonly ICommandCapture[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 3) return commands;

  return commands.filter((command) =>
    [command.name, command.marker, command.text].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(normalizedQuery)
    )
  );
}

/** Creates the ordered framebuffer checkpoints shown beside the command list. */
export function createVisualCheckpoints(
  initState: State,
  commands: readonly ICommandCapture[]
): readonly SpectorVisualCheckpoint[] {
  const checkpoints: SpectorVisualCheckpoint[] = [
    { state: readVisualState(initState), commandIndex: 0, label: 'Initial state' }
  ];

  commands.forEach((command, commandIndex) => {
    if (!isRecord(command.VisualState)) return;
    checkpoints.push({
      state: command.VisualState,
      commandIndex,
      label: command.name === 'clear' ? 'Clear' : `After ${command.name}`
    });
  });

  return checkpoints;
}

/** Reads framebuffer images and labels from a raw Spector visual state. */
export function normalizeVisualState(value: unknown): SpectorVisualState {
  if (!isRecord(value)) return { attachments: [], framebufferLabel: 'Canvas frame buffer' };

  const attachments = Array.isArray(value.Attachments)
    ? value.Attachments.filter(isRecord).map((attachment) => ({
        src: readOptionalString(attachment.src),
        attachmentName: readOptionalString(attachment.attachmentName),
        textureLayer: readOptionalStringOrNumber(attachment.textureLayer),
        textureCubeMapFace: readOptionalString(attachment.textureCubeMapFace)
      }))
    : [];
  const framebuffer = isRecord(value.FrameBuffer) ? value.FrameBuffer : undefined;
  const tag = framebuffer && isRecord(framebuffer.__SPECTOR_Object_TAG) ? framebuffer.__SPECTOR_Object_TAG : undefined;
  const displayText = tag ? readOptionalString(tag.displayText) : undefined;
  const id = tag ? readOptionalStringOrNumber(tag.id) : undefined;

  return {
    attachments,
    framebufferLabel: displayText ?? (id === undefined ? 'Canvas frame buffer' : `Frame buffer: ${id}`),
    status: readOptionalString(value.FrameBufferStatus)
  };
}

/** Extracts an editable shader pair from a draw-call command when one is present. */
export function readShaderProgram(command: ICommandCapture): SpectorShaderProgram | undefined {
  if (!isRecord(command.DrawCall)) return undefined;
  const drawCall = command.DrawCall;
  if (!Array.isArray(drawCall.shaders) || drawCall.shaders.length < 2) return undefined;
  const vertex = readShader(drawCall.shaders[0]);
  const fragment = readShader(drawCall.shaders[1]);
  if (!vertex || !fragment || !isRecord(drawCall.programStatus) || !isRecord(drawCall.programStatus.program)) {
    return undefined;
  }

  const tag = drawCall.programStatus.program.__SPECTOR_Object_TAG;
  if (!isRecord(tag) || typeof tag.id !== 'number') return undefined;

  return {
    programId: tag.id,
    editable: drawCall.programStatus.RECOMPILABLE === true,
    vertex,
    fragment
  };
}

/** Human-readable name for Spector's command analysis status. */
export function commandStatusLabel(status: CommandCaptureStatus): string {
  switch (status) {
    case CommandCaptureStatus.Deprecated:
      return 'Deprecated';
    case CommandCaptureStatus.Unused:
      return 'Unused';
    case CommandCaptureStatus.Disabled:
      return 'Disabled';
    case CommandCaptureStatus.Redundant:
      return 'Redundant';
    case CommandCaptureStatus.Valid:
      return 'Valid';
    default:
      return 'Unknown';
  }
}

/** Tests whether a nested captured value contains a case-insensitive query. */
export function capturedValueMatches(value: unknown, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 3) return true;
  return valueMatches(value, normalizedQuery, new WeakSet<object>());
}

/** Converts scalar and tagged Spector values to compact display text. */
export function formatCapturedValue(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(4);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (!isRecord(value)) return String(value);

  const tag = value.__SPECTOR_Object_TAG;
  if (isRecord(tag) && typeof tag.displayText === 'string') return tag.displayText;
  if (typeof value.displayText === 'string') return value.displayText;
  return undefined;
}

/** Narrows unknown capture data to a key-value record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readVisualState(state: State): State {
  return isRecord(state.VisualState) ? state.VisualState : {};
}

function readShader(value: unknown): SpectorShader | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.source !== 'string') return undefined;
  return {
    name: value.name,
    source: value.source,
    translatedSource: typeof value.translatedSource === 'string' ? value.translatedSource : ''
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readOptionalStringOrNumber(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function valueMatches(value: unknown, query: string, seen: WeakSet<object>): boolean {
  const scalar = formatCapturedValue(value);
  if (scalar !== undefined) return scalar.toLowerCase().includes(query);
  if (!isRecord(value) || seen.has(value)) return false;
  seen.add(value);

  return Object.entries(value).some(
    ([key, nestedValue]) => key.toLowerCase().includes(query) || valueMatches(nestedValue, query, seen)
  );
}
