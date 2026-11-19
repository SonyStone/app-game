import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import { brushSchema, parseDocument } from '@app-game/paint-core/paintbrush/document';
import { createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { brushView } from '../brush-editor/brushView';
import { coverageMap } from '../brush-library/abrPresetDocument';
import { roundDocumentText, syncHost } from '../brush-library/documentSettings';
import { chooseRenderPath } from '../brush-library/nativeDocument';
import { resolveDocument } from '../brush-library/resolveDocument';
import type { PaintSession } from '../session';

/**
 * The brush studio's editing of the session's current brush, the same for every brush: the studio reads the brush's
 * document (`view`) and every edit is the document's next text (`update`), which is patched, resolved (choosing Paint's
 * round renderer or the ABR one from the document alone), its new images uploaded and then published under a
 * revision guard, so a late answer for an older edit or another preset is dropped. Until then the view echoes the
 * edit. The document is the preset's accepted edit, else its saved document, else the round brush's own; Paint's own
 * settings changed outside the studio, as on the board, are written into it as they change (see `syncHost`).
 *
 * `checkpoint` takes what Cancel returns to and `revert` returns to it: the document edit and the brush as they were.
 */
export function createBrushSettingsEditor(session: PaintSession) {
  const { tools, brush, library, engine } = session;
  const preset = createMemo(() => tools.preset());
  // Colors are the user's, not the brush's: changing them leaves the document alone.
  const live = createMemo(brush, { equals: sameSettings });
  const [pending, setPending] = createSignal<{ preset: string; text: string }>();
  const [editError, setEditError] = createSignal('');
  const text = createMemo(() => {
    const id = preset();
    const echo = pending();
    if (echo?.preset === id) {
      return echo.text;
    }

    const chosen = library.find(id);
    const saved = tools.documentText(id) ?? chosen?.abrDocument;
    try {
      if (saved) {
        return syncHost(saved, live());
      }

      return live().engine?.id === 'abr' ? undefined : roundDocumentText(chosen, live());
    } catch {
      return undefined;
    }
  });
  const view = createMemo(() => {
    const current = text();
    return current === undefined ? undefined : brushView(current, live());
  });
  // The images of the latest edit, which the preset's saved images lack.
  const [edited, setEdited] = createSignal<{ preset: string; resources: readonly BrushResource[] }>();
  let revision = 0;
  onCleanup(() => {
    revision++;
  });

  return {
    /** The current brush's document as the studio reads it; `undefined` for a brush that has none to edit. */
    view,
    editError,
    update,
    /** The images the latest edit of the chosen preset made, which its saved images lack; reactive. */
    resources: () => {
      const edits = edited();
      return edits?.preset === preset() ? edits.resources : [];
    },
    /** What Cancel returns to, now: the chosen preset, its document edit, its document and its brush settings. */
    checkpoint(): Checkpoint {
      const id = preset();
      return { preset: id, edit: tools.documentEdit(id), text: text(), brush: editableSettings(brush()) };
    },
    /** Whether the brush or its document differs from `checkpoint`. */
    changedSince(checkpoint: Checkpoint) {
      return (
        checkpoint.preset === preset() &&
        (checkpoint.text !== text() || JSON.stringify(editableSettings(brush())) !== JSON.stringify(checkpoint.brush))
      );
    },
    /** Puts back the document edit and the brush settings of `checkpoint`, dropping any edit still resolving. */
    revert(checkpoint: Checkpoint) {
      revision++;
      setPending(undefined);
      setEditError('');
      if (checkpoint.preset !== preset()) {
        return;
      }

      tools.restoreDocumentEdit(checkpoint.preset, checkpoint.edit);
      tools.updateBrush(structuredClone(checkpoint.brush));
    }
  };

  /**
   * Echoes `next` at once and publishes it once resolved and its new images are resident for the next stroke. A
   * document Paint's round renderer draws publishes at once, as it needs neither images nor the ABR adapter.
   */
  async function update(next: string) {
    const id = preset();
    const chosen = library.find(id);
    const host = untrack(brush);
    const version = ++revision;
    setEditError('');
    setPending({ preset: id, text: next });
    const current = () => version === revision && preset() === id;
    try {
      const document = parseDocument(next, brushSchema);
      const round = chooseRenderPath(document);
      if (round.path === 'round') {
        publish(next, round.settings, []);
        return;
      }

      const images = chosen?.assetIds?.length ? await library.assets(chosen) : undefined;
      if (images?.isErr()) {
        throw new Error(images.error.message);
      }

      const coverage = images?.isOk() ? images.value : [];
      const {
        settings: resolved,
        resources = [],
        reasons
      } = await resolveDocument(document, coverageMap(coverage), host);
      if (!current()) {
        return;
      }

      if (!resolved) {
        throw new Error(reasons.join(', '));
      }

      if (resources.length) {
        const uploaded = await engine.putResources(resources);
        if (!current()) {
          return;
        }

        if (uploaded.isErr()) {
          throw new Error(uploaded.error.message);
        }
      }

      publish(next, resolved, resources);
    } catch (error) {
      if (current()) {
        setPending(undefined);
        setEditError(error instanceof Error ? error.message : String(error));
      }
    }

    /** Publishes the resolved document: its edit, its images, and the brush settings it holds. */
    function publish(text: string, resolved: Partial<Brush>, resources: readonly BrushResource[]) {
      const settings = publishedSettings(resolved);
      const published = { ...host, ...settings };
      // A round brush whose document says no more than its settings needs no document edit.
      if (
        !chosen?.abrDocument &&
        published.engine?.id !== 'abr' &&
        sameDocument(text, roundDocumentText(chosen, published))
      ) {
        tools.restoreDocumentEdit(id, undefined);
      } else {
        tools.setDocumentEdit(id, text, settings.engine, resources);
      }

      setEdited({ preset: id, resources });
      tools.updateBrush(settings);
      setPending(undefined);
    }
  }
}

/** What Cancel returns to; see `checkpoint`. */
type Checkpoint = {
  preset: string;
  edit: ReturnType<PaintSession['tools']['documentEdit']>;
  text: string | undefined;
  brush: ReturnType<typeof editableSettings>;
};

/** The brush settings a document edit can change, the engine included even when it is absent. */
function editableSettings(brush: Brush) {
  const { size, opacity, flow, mixing, hardness, spacing, pressureSize, pressureFlow, stroke, engine } = brush;
  return { size, opacity, flow, mixing, hardness, spacing, pressureSize, pressureFlow, stroke: { ...stroke }, engine };
}

/**
 * The settings of a resolved document that the studio publishes: the engine (absent for Paint's round renderer) and
 * Paint's own settings it holds. The tool and the colors stay as they are.
 */
function publishedSettings(settings: Partial<Brush>): Partial<Brush> {
  const published: Partial<Brush> = { engine: settings.engine };
  for (const key of [
    'size',
    'opacity',
    'flow',
    'hardness',
    'spacing',
    'pressureSize',
    'pressureFlow',
    'mixing',
    'stroke'
  ] as const) {
    if (settings[key] !== undefined) {
      Object.assign(published, { [key]: settings[key] });
    }
  }

  return published;
}

/** Whether two brush settings differ only in their colors. */
function sameSettings(a: Brush, b: Brush) {
  return (Object.keys({ ...a, ...b }) as (keyof Brush)[]).every(
    (key) => key === 'color' || key === 'backgroundColor' || a[key] === b[key]
  );
}

/** Whether two document texts hold the same values, whatever the order of their keys, bindings and applied paths. */
function sameDocument(a: string, b: string) {
  return canonical(JSON.parse(a)) === canonical(JSON.parse(b));
}

/** A value's JSON with sorted keys, without empty `extensions` and `dynamics`, which mean what their absence does. */
function canonical(value: unknown, key = ''): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonical(item));
    return '[' + (key === 'apply' || key === 'dynamics' ? items.sort() : items).join(',') + ']';
  }

  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .filter((name) => {
          const item = (value as Record<string, unknown>)[name];
          return item !== undefined && !(['extensions', 'dynamics'].includes(name) && isEmpty(item));
        })
        .sort()
        .map((name) => JSON.stringify(name) + ':' + canonical((value as Record<string, unknown>)[name], name))
        .join(',') +
      '}'
    );
  }

  return JSON.stringify(value);
}

function isEmpty(value: unknown) {
  return Array.isArray(value) ? value.length === 0 : !!value && typeof value === 'object' && !Object.keys(value).length;
}
