import type { BrushAsset } from '@app-game/abr-brush/library';
import type { prepareAbrBrush } from '@app-game/abr-paint/preset';
import type { Brush } from '@app-game/paint-core/brush';
import { errorMessage } from '@app-game/solid-gpu/errors';
import { err, Result } from 'neverthrow';
import { brushError, engineError, type PaintError } from '../../shared/errors';
import type { BrushLibrary, BrushPreset } from '../brush-library';

/**
 * Imports ABR presets chosen in the ABR viewer into the brush library and applies them to the ABR brush. Importing
 * the same viewer brush again replaces its earlier import. The preset becomes the active brush only after the engine
 * has acknowledged all of its tip, texture and dual-brush resources; a failed upload keeps the previous brush, but the
 * imported preset stays in the library.
 */
export function createAbrPresets(options: {
  library: Pick<BrushLibrary, 'importPreset'>;
  /** Uploads the preset's resources and selects it; see `createPresetUploads`. */
  choose: (preset: BrushPreset) => Promise<Result<void, PaintError>>;
  /** Whether the brush may change now: no upload, stroke, selection edit or brush command runs. */
  canChange: () => boolean;
}) {
  return { useBrush, usePreset };

  /**
   * Converts an ABR brush chosen in the viewer and applies it. Unsupported preset settings are returned as an
   * `invalid-preset` error; see `usePreset` for the upload.
   */
  async function useBrush(asset: BrushAsset): Promise<Result<void, PaintError>> {
    const { prepareAbrBrush } = await import('@app-game/abr-paint/preset');
    const prepared = Result.fromThrowable(prepareAbrBrush, (cause) =>
      brushError('invalid-preset', errorMessage(cause), cause)
    )(asset);
    return prepared.isErr() ? err(prepared.error) : usePreset(prepared.value, `abr:${asset.id}`);
  }

  /**
   * Imports a converted preset under `source`, which identifies its viewer brush, and applies it. Returns a retryable
   * `busy` error, importing nothing, while another preset, stroke, selection edit or brush command is running.
   */
  async function usePreset(next: AbrPreset, source: string): Promise<Result<void, PaintError>> {
    if (!options.canChange()) {
      return err(engineError('busy', 'Wait for Paint to finish the current operation.'));
    }

    if (!next.resources[0]) {
      return err(brushError('invalid-preset', 'The preset has no primary tip.'));
    }

    const preset = await options.library.importPreset(
      { name: next.name, source, settings: { engine: next.engine, tool: 'brush', ...abrSettings(next) } },
      next.resources
    );
    return options.choose(preset);
  }
}

/** A converted ABR preset: its brush engine selection, resources and stroke defaults. */
export type AbrPreset = ReturnType<typeof prepareAbrBrush>;

/** Stroke defaults carried by the preset; unset colors, flow and opacity are not part of the imported preset. */
function abrSettings(preset: AbrPreset): Partial<Brush> {
  return {
    size: preset.size,
    spacing: preset.spacing,
    ...(preset.color === undefined ? {} : { color: preset.color }),
    ...(preset.backgroundColor === undefined ? {} : { backgroundColor: preset.backgroundColor }),
    ...(preset.flow === undefined ? {} : { flow: preset.flow }),
    ...(preset.opacity === undefined ? {} : { opacity: preset.opacity })
  };
}
