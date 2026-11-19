import { formValuesToBrush } from '@app-game/abr-brush/form';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import type { BrushResource } from '@app-game/abr-paint/resources';
import { initAbr } from '@app-game/abr-parser';
import type { Brush } from '@app-game/paint-core/brush';
import { brushSchema, parseDocument } from '@app-game/paint-core/paintbrush/document';
import { createEffect, createMemo, createSignal, getOwner, isDisposed, onCleanup } from 'solid-js';
import { abrCategoriesFor, abrCategoriesWithPattern, abrValues } from '../brush-editor/abrSchema';
import { patchAbrValues } from '../brush-library/abrDocument';
import { resolveAbrText } from '../brush-library/abrPresetDocument';
import type { PaintSession } from '../session';

/**
 * Echoes patches and uploads ABR masks before publishing a coherent brush update.
 * Initializes the parser only for a selected ABR source while `needed` is true; defaults to an active editor.
 */
export function createBrushSettingsEditor(session: PaintSession, needed: () => boolean = () => true) {
  const { tools, brush, library, engine } = session;
  const preset = createMemo(() => tools.preset());
  const selected = createMemo(() => library.find(preset()));
  const source = createMemo(() => (selected()?.abrDocument ? undefined : selected()?.abrSource));
  const [abrReady, setAbrReady] = createSignal(false);
  const categories = createMemo(() => {
    const text = selected()?.abrDocument;
    if (text) {
      return abrCategoriesWithPattern(!!parseDocument(text, brushSchema).definition.texture);
    }
    return source() && abrReady() ? abrCategoriesFor(source()!) : undefined;
  });
  const [edited, setEdited] = createSignal(() => brush());
  const [editError, setEditError] = createSignal('');
  const owner = getOwner()!;
  let initializing = false;
  createEffect(
    () => Boolean(source()) && needed(),
    (required) => {
      if (!required || initializing) {
        return;
      }

      initializing = true;
      void initAbr()
        .then(() => {
          if (!isDisposed(owner)) {
            setAbrReady(true);
          }
        })
        .catch((error: unknown) => {
          initializing = false;
          if (!isDisposed(owner)) {
            setEditError(error instanceof Error ? error.message : String(error));
          }
        });
    }
  );
  let revision = 0;
  // The images of the latest ABR edit, which the preset's saved images lack.
  const [editedAbr, setEditedAbr] = createSignal<{ preset: string; resources: readonly BrushResource[] }>();
  onCleanup(() => {
    revision++;
  });
  /** Echo rows immediately; new masks must be resident before the next stroke uses their IDs. */
  async function updateEditor(patch: Partial<Brush>) {
    const id = preset();
    const selected = library.find(id);
    const text = selected?.abrDocument;
    const source = text ? undefined : selected?.abrSource;
    const next = { ...edited(), ...patch };
    const version = ++revision;
    setEditError('');
    if ((!source && !text) || next.engine?.id !== 'abr' || (!patch.engine && edited().engine === brush().engine)) {
      tools.updateBrush(patch);
      return;
    }

    setEdited(next);
    try {
      const document = text && patchAbrValues(text, abrValues(next));
      let prepared;
      if (document && selected) {
        const assets = await library.assets(selected);
        if (assets.isErr()) {
          throw new Error(assets.error.message);
        }
        prepared = await resolveAbrText(document, assets.value);
      } else {
        prepared = prepareAbrBrush(formValuesToBrush(source!, abrValues(next)));
      }
      if (version !== revision || preset() !== id) {
        return;
      }
      const uploaded = await engine.putResources(prepared.resources);
      if (version !== revision || preset() !== id) {
        return;
      }

      if (uploaded.isErr()) {
        throw new Error(uploaded.error.message);
      }

      setEditedAbr({ preset: id, resources: prepared.resources });
      if (document) {
        tools.setDocumentEdit(id, document, prepared.engine, prepared.resources);
      }
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
    /** The images the latest ABR edit of the chosen preset made, which its saved images lack; reactive. */
    resources: () => {
      const edits = editedAbr();
      return edits?.preset === preset() ? edits.resources : [];
    }
  };
}
