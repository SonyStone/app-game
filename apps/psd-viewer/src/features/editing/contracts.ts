import type {
  PsdEditorFailure,
  PsdEditorResult,
  PsdEditorSession,
  PsdExactRasterTreeEdit,
  PsdReopenSaveContract,
  PsdStateMetadataEdit
} from '@app-game/psd/editor';

/** A viewer refusal retains a machine-readable dependency path, independently of backend exceptions. */
export type EditingFailure =
  | PsdEditorFailure
  | {
      code: 'HostAttributionRequired' | 'HostOperandRequired' | 'HistoryLimit' | 'StaleRevision';
      message: string;
      propertyPath: string;
    };

/** Expected editor failures never trigger another contract or a partial save. */
export type EditingResult<T> = { ok: true; value: T } | { ok: false; error: EditingFailure };

/** The backend's native metadata contract is distinct from raster/tree reopen equivalence. */
export type EditingCommand =
  | { kind: 'tree'; edit: PsdExactRasterTreeEdit }
  | { kind: 'metadata'; edit: PsdStateMetadataEdit };

/** Inspection describes stored records only; it grants no edit admission. */
export type EditingState = {
  revision: number;
  position: number;
  historyLength: number;
  tree: ReturnType<PsdEditorSession['inspect']>;
  source: ReturnType<PsdEditorSession['inspectSource']>;
  process: ReturnType<PsdEditorSession['inspectProcess']>;
  cost: { milliseconds: number; replayed: number; sourceBytes: number };
};

/** Save IDs name frozen resources and remain usable after later edits. */
export type EditingRequest =
  | { kind: 'open' }
  | { kind: 'edit'; revision: number; command: EditingCommand }
  | { kind: 'undo' | 'redo'; revision: number }
  | { kind: 'freeze'; revision: number }
  | { kind: 'chunk'; save: string; maxBytes: number }
  | { kind: 'release'; save: string };

/** Each RPC returns one variant; failures preserve the current session and public revision. */
export type EditingResponse =
  | { kind: 'state'; state: EditingState }
  | { kind: 'frozen'; save: string; revision: number }
  | { kind: 'chunk'; bytes: Uint8Array | undefined }
  | { kind: 'released' };

/** Truthful host identity. Imported Photoshop attribution is never reused as our saving agent. */
export const viewerAgent = 'PSD Viewer';

/** Maximum commands replayed for any commit or undo. No source or history eviction changes undo semantics. */
export const historyLimit = 64;

/** First preservation contract considered. Unavailable host operands refuse before any downgrade. */
export const preferredContract = 'photoshop26.reopen-equivalent/v3-carried-untouched' satisfies PsdReopenSaveContract;

/**
 * The bundled exact-save validator requires an Adobe Photoshop agent. File Info copyright also emits a
 * hardcoded Photoshop event/EXIF agent. Neither is an honest browser operation. Refuse before mutation;
 * this host guard does not relax or replace backend admission for operations that can be attempted.
 */
export function hostRefusal(command: EditingCommand): EditingFailure | undefined {
  if (command.kind === 'tree') {
    return {
      code: 'HostAttributionRequired',
      propertyPath: 'save.softwareAgent',
      message: `The bundled exact-edit contract requires an Adobe Photoshop identity. ${viewerAgent} cannot claim it. No edit or weaker contract was attempted.`
    };
  }

  if (command.edit.kind === 'fileInfoCopyright') {
    return {
      code: 'HostAttributionRequired',
      propertyPath: 'metadata.fileInfo.softwareAgent',
      message:
        'The bundled copyright writer hardcodes a Photoshop history/EXIF agent and accepts no truthful saving-agent operand.'
    };
  }

  return undefined;
}

/** Retains backend refusal fields while dropping exception objects before worker transfer. */
export function wireResult<T>(result: PsdEditorResult<T>): PsdEditorResult<T> {
  if (result.ok) {
    return result;
  }

  const { cause: _cause, ...error } = result.error;
  return { ok: false, error };
}
