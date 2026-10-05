import type { BrushResource } from '@app-game/abr-paint/resources';
import { abortedError } from '@app-game/solid-gpu/errors';
import { err, ok, type Result } from 'neverthrow';
import { getOwner, isDisposed } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { brushError, engineError, type PaintError } from '../../shared/errors';
import type { BrushPreset } from './brushPresets';

/**
 * Keeps the images of chosen presets resident in the drawing engine. A preset with images becomes active only after
 * they have been read and the engine has acknowledged all of them; a failed read or upload keeps the previous brush.
 * `restore` uploads the images of the presets in use to a replacement engine before input resumes; other presets'
 * images are not read. A preset in use whose images cannot be read is reported through `onUnavailable` and skipped,
 * so that missing brush images never keep the engine paused.
 *
 * Must be created within a Solid owner; uploads finishing after disposal resolve as aborted.
 */
export function createPresetUploads<Slot extends string>(options: {
  /** Reads a preset's images; see `BrushLibrary.resources`. */
  resources: (preset: BrushPreset) => Promise<Result<BrushResource[], PaintError>>;
  /** Makes all of a preset's images resident in the engine at once; see `PaintEngine.putResources`. */
  upload: (resources: readonly BrushResource[]) => Promise<Result<void, PaintError>>;
  /** Whether the brush may change now: the engine is ready and no stroke, selection edit or brush command runs. */
  canChange: () => boolean;
  /** Activates a preset whose resources are resident. */
  select: (id: string, slot: Slot) => void;
  /** Presets in use by any tool, after `loaded` resolves. */
  inUse: () => readonly BrushPreset[];
  /** A preset in use could not be restored because its images are missing; its tools should stop using it. */
  onUnavailable: (preset: BrushPreset, error: PaintError) => void;
  /** Resolves when the presets in use are known: the library and the stored tool state have loaded. */
  loaded: Promise<unknown>;
}) {
  const owner = getOwner();
  const [working, setWorking, isWorking] = createImmediateSignal(false);
  let settled = false;
  void options.loaded.then(() => {
    settled = true;
  });

  return {
    /** A preset's images are being read or uploaded. */
    busy: working,
    /** Like `busy`, including uploads started earlier in the current event; for synchronous guards. */
    isBusy: isWorking,
    choose,
    /**
     * Uploads the images of the presets in use to a replacement engine. Returns `undefined` when the presets in use are
     * known and have no images, so a new engine becomes ready immediately.
     */
    restore(): Promise<Result<void, PaintError>> | undefined {
      if (settled && options.inUse().every((preset) => preset.resourceIds.length === 0)) {
        return undefined;
      }

      return options.loaded.then(async () => {
        const resources = await resourcesInUse();
        if (resources.length === 0) {
          return ok();
        }

        const uploaded = await options.upload(resources);
        return uploaded.mapErr((error) => brushError('restore', error.message, error));
      });
    }
  };

  /**
   * Uploads a preset's resources, if any, and then makes `slot` use it. Returns a retryable `busy` error, changing
   * nothing, while another upload, stroke, selection edit or brush command is running.
   */
  async function choose(preset: BrushPreset, slot: Slot): Promise<Result<void, PaintError>> {
    if (preset.resourceIds.length === 0) {
      options.select(preset.id, slot);
      return ok();
    }

    if (isWorking() || !options.canChange()) {
      return err(engineError('busy', 'Wait for Paint to finish the current operation.'));
    }

    setWorking(true);
    const resources = await options.resources(preset);
    const uploaded = resources.isOk() ? await options.upload(resources.value) : err(resources.error);
    if (isDisposed(owner!)) {
      return err(abortedError());
    }

    setWorking(false);
    if (uploaded.isErr()) {
      return uploaded;
    }

    options.select(preset.id, slot);
    return ok();
  }

  /** Images of the presets in use that can be read, each once. */
  async function resourcesInUse(): Promise<BrushResource[]> {
    const resources = new Map<string, BrushResource>();
    for (const preset of options.inUse()) {
      const read = await options.resources(preset);
      if (read.isErr()) {
        options.onUnavailable(preset, read.error);
        continue;
      }

      read.value.forEach((resource) => resources.set(resource.id, resource));
    }

    return [...resources.values()];
  }
}
