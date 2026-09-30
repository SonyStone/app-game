import type { BrushAsset } from '@app-game/abr-brush/library';
import type { prepareAbrBrush } from '@app-game/abr-paint/preset';
import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import type { BrushEngineSelection } from '@app-game/paint-core/composition/defineBrushEngine';
import { abortedError, errorMessage } from '@app-game/solid-gpu/errors';
import { err, ok, Result } from 'neverthrow';
import { createSignal, getOwner, isDisposed, latest } from 'solid-js';
import { brushError, engineError, type PaintError } from '../../shared/errors';

/**
 * Applies ABR presets chosen in the ABR viewer. A preset becomes the active brush only after the engine has
 * acknowledged all of its tip, texture and dual-brush resources; a failed upload keeps the previous brush. The
 * selected preset outlives engine replacements: `restore` uploads it to a new engine before input resumes.
 * Must be created within a Solid owner; results arriving after disposal resolve as aborted.
 */
export function createAbrPresets(options: {
  /** Uploads one resource unless the engine already holds it; see `PaintEngine.putResource`. */
  upload: (resource: BrushResource) => Promise<Result<void, PaintError>>;
  /** Whether the brush may change now: the engine is ready and no stroke, selection edit or brush command runs. */
  canChange: () => boolean;
  /** Activates the uploaded preset's engine with its size, spacing, colors, flow and opacity. */
  select: (engine: BrushEngineSelection, settings: Partial<Brush>) => void;
}) {
  const owner = getOwner();
  const [preset, setPreset] = createSignal<AbrPreset>();
  const [working, setWorking] = createSignal(false);

  return {
    /** The applied preset, if any. */
    preset,
    /** A preset is being prepared or uploaded. */
    busy: working,
    /** Like `busy`, including work started earlier in the current event; for synchronous guards. */
    isBusy: () => latest(working),
    useBrush,
    usePreset,
    /**
     * Uploads the applied preset to a replacement engine. Returns `undefined` when no preset is applied, so a new
     * engine without one becomes ready immediately.
     */
    restore(): Promise<Result<void, PaintError>> | undefined {
      const current = latest(preset);
      if (!current) {
        return undefined;
      }

      return uploadAll(current.resources).then((uploaded) =>
        uploaded.mapErr((error) => brushError('restore', error.message, error))
      );
    }
  };

  /**
   * Converts an ABR brush chosen in the viewer and applies it. Unsupported preset settings are returned as an
   * `invalid-preset` error; see `usePreset` for the upload.
   */
  async function useBrush(asset: BrushAsset): Promise<Result<void, PaintError>> {
    const { prepareAbrBrush } = await import('@app-game/abr-paint/preset');
    const prepared = Result.fromThrowable(prepareAbrBrush, (cause) =>
      brushError('invalid-preset', errorMessage(cause), cause)
    )(asset);
    return prepared.isErr() ? err(prepared.error) : usePreset(prepared.value);
  }

  /**
   * Uploads a converted preset's resources and then activates it. Returns a retryable `busy` error, changing nothing,
   * while another preset, stroke, selection edit or brush command is running.
   */
  async function usePreset(next: AbrPreset): Promise<Result<void, PaintError>> {
    if (latest(working) || !options.canChange()) {
      return err(engineError('busy', 'Wait for Paint to finish the current operation.'));
    }

    if (!next.resources[0]) {
      return err(brushError('invalid-preset', 'The preset has no primary tip.'));
    }

    setWorking(true);
    const uploaded = await uploadAll(next.resources);
    if (isDisposed(owner!)) {
      return err(abortedError());
    }

    setWorking(false);
    if (uploaded.isErr()) {
      return uploaded;
    }

    setPreset(next);
    options.select(next.engine, presetSettings(next));
    return ok();
  }

  async function uploadAll(resources: BrushResource[]): Promise<Result<void, PaintError>> {
    for (const resource of resources) {
      const uploaded = await options.upload(resource);
      if (uploaded.isErr()) {
        return uploaded;
      }
    }

    return ok();
  }
}

/** A converted ABR preset: its brush engine selection, resources and stroke defaults. */
export type AbrPreset = ReturnType<typeof prepareAbrBrush>;

/** Stroke defaults carried by the preset; unset colors, flow and opacity keep the current brush values. */
function presetSettings(preset: AbrPreset): Partial<Brush> {
  return {
    size: preset.size,
    spacing: preset.spacing,
    ...(preset.color === undefined ? {} : { color: preset.color }),
    ...(preset.backgroundColor === undefined ? {} : { backgroundColor: preset.backgroundColor }),
    ...(preset.flow === undefined ? {} : { flow: preset.flow }),
    ...(preset.opacity === undefined ? {} : { opacity: preset.opacity })
  };
}
