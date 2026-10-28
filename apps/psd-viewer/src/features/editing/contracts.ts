import type {
  PsdEditorFailure,
  PsdEditorResult,
  PsdEditorSession,
  PsdExactRasterTreeEdit,
  PsdReopenSaveContract,
  PsdSourceHostSaveContext,
  PsdStateMetadataEdit
} from '@app-game/psd/editor';
import type { PsdInfo, PsdLayerNode, PsdStates } from '@app-game/psd/viewer';

/** A viewer refusal retains a machine-readable dependency path, independently of backend exceptions. */
export type EditingFailure =
  | PsdEditorFailure
  | {
      code: 'HostOperandRequired' | 'HistoryLimit' | 'StaleRevision';
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
  /** Renderer metadata after a visual transaction; absent for pixel-preserving metadata changes. */
  display?: { info: PsdInfo; layers: PsdLayerNode[]; states: PsdStates };
  cost: { milliseconds: number; replayed: number; sourceBytes: number };
};

/** Save IDs name frozen resources and remain usable after later edits. */
export type EditingRequest =
  | { kind: 'open'; basename?: string }
  | { kind: 'edit'; revision: number; command: EditingCommand; options?: EditingSaveOptions }
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

/** Browser save choice. Strict current-host saving is unavailable without a real host integration. */
export type EditingSaveOptions = {
  mode: 'source';
  /** Explicit RGB blend gamma choice, independent of carried source host facts. */
  linearBlending: boolean;
};

/** Each tree action saves one pristine source under v5; refusal never selects a weaker contract. */
export const preferredContract = 'photoshop26.reopen-equivalent/v5-source-host' satisfies PsdReopenSaveContract;

/**
 * Captures genuine runtime operands once per action, then retains them unchanged for undo/redo replay.
 * No native compositor, profile, locale or font operands are accepted by this browser path.
 */
export function sourceSaveOperands(
  basename: string,
  options: EditingSaveOptions
): Omit<PsdSourceHostSaveContext, 'sourceBytes'> {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    contract: preferredContract,
    save: {
      basename: basename.replace(/\.(psd|psb)$/i, ''),
      saveTime: now.toISOString().slice(0, 19) + '+00:00',
      exifTime: `${now.getFullYear()}:${pad(now.getMonth() + 1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      instanceId: `xmp.iid:${crypto.randomUUID()}`,
      documentId: `adobe:docid:photoshop:${crypto.randomUUID()}`,
      softwareAgent: viewerAgent,
      linearBlending: options.linearBlending
    },
    editTime: now.valueOf() / 1000
  };
}

/**
 * Formats an instant as local wall-clock ISO time with its numeric offset, e.g. `2026-10-27T21:58:20+01:00`.
 * File Info derives its offset-less EXIF DateTime from the first 19 characters, so UTC components would shift it.
 * The offset is the one in effect at that instant, so replaying a retained instant yields the same string.
 */
export function localIsoTime(instant: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -instant.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const minutes = Math.abs(offset);
  return (
    `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
    `T${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}` +
    `${sign}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
  );
}

/** Concise explanations retain the backend's named dependency separately for diagnosis. */
export function readableRefusal(error: EditingFailure): string {
  const path = 'propertyPath' in error ? error.propertyPath : '';
  if (/typeRendering|font|Txt2|typeGraph/i.test(path)) {
    return 'This document has text layers whose fonts the browser cannot vouch for.';
  }
  if (/background.*name/i.test(path)) {
    return 'Changing Background needs a localized layer name that this file does not establish.';
  }
  if (/grid|guide/i.test(path)) {
    return 'This file does not establish the grid or guide settings needed to save this edit.';
  }
  if (/profile|icc|working/i.test(path)) {
    return 'This file does not establish the color profile needed to save this edit.';
  }
  if (/label|locale|transparencyName|proof/i.test(path)) {
    return 'This file does not establish the localized labels needed to save this edit.';
  }
  if (/initial|creation|xmp/i.test(path)) {
    return 'This file lacks the initialized document history needed to save this edit.';
  }
  return error.message;
}

/** Retains backend refusal fields while dropping exception objects before worker transfer. */
export function wireResult<T>(result: PsdEditorResult<T>): PsdEditorResult<T> {
  if (result.ok) {
    return result;
  }

  const { cause: _cause, ...error } = result.error;
  return { ok: false, error };
}
