import { formValuesToBrush } from '@app-game/abr-brush/form';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import type { Brush } from '@app-game/paint-core/brush';
import { createMemo, createSignal, getOwner, isDisposed, onCleanup } from 'solid-js';
import { abrCategoriesFor, abrValues } from '../brush-editor/abrSchema';
import type { PaintSession } from '../session';

/** Shared live editor path: echo patches, prepare ABR masks, upload, then publish one coherent brush update. */
export function createBrushSettingsEditor(session: PaintSession) {
  const { tools, brush, library, engine } = session;
  const preset = createMemo(() => tools.preset());
  const source = createMemo(() => library.find(preset())?.abrSource);
  const [abrReady, setAbrReady] = createSignal(false);
  const categories = createMemo(() => (source() && abrReady() ? abrCategoriesFor(source()!) : undefined));
  const [edited, setEdited] = createSignal(() => brush());
  const [editError, setEditError] = createSignal('');
  const owner = getOwner()!;
  // Reloaded library presets have a descriptor before the lazily mounted ABR viewer initializes its parser.
  void initAbr()
    .then(() => {
      if (!isDisposed(owner)) {
        setAbrReady(true);
      }
    })
    .catch((error: unknown) => {
      if (!isDisposed(owner)) {
        setEditError(error instanceof Error ? error.message : String(error));
      }
    });
  let revision = 0;
  let previewResources: { preset: string; resources: readonly BrushResource[] } | undefined;
  onCleanup(() => {
    revision++;
  });
  /** Echo rows immediately; new masks must be resident before the next stroke uses their IDs. */
  async function updateEditor(patch: Partial<Brush>) {
    const id = preset();
    const source = library.find(id)?.abrSource;
    const next = { ...edited(), ...patch };
    const version = ++revision;
    setEditError('');
    if (!source || next.engine?.id !== 'abr' || (!patch.engine && edited().engine === brush().engine)) {
      tools.updateBrush(patch);
      return;
    }

    setEdited(next);
    try {
      const prepared = prepareAbrBrush(formValuesToBrush(source, abrValues(next)));
      const uploaded = await engine.putResources(prepared.resources);
      if (version !== revision || preset() !== id) {
        return;
      }

      if (uploaded.isErr()) {
        throw new Error(uploaded.error.message);
      }

      previewResources = { preset: id, resources: prepared.resources };
      tools.updateBrush({
        ...patch,
        engine: prepared.engine,
        size: prepared.size,
        spacing: prepared.spacing,
        flow: prepared.flow ?? next.flow,
        opacity: prepared.opacity ?? next.opacity
      });
    } catch (error) {
      if (version === revision && preset() === id) {
        setEdited(brush());
        setEditError(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return {
    edited,
    categories,
    editError,
    update: updateEditor,
    resources: () => (previewResources?.preset === preset() ? previewResources.resources : [])
  };
}
