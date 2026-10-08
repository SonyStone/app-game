import type { PsdRenderSettings } from '@app-game/psd/viewer';
import { createMemo, createSignal, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf } from '../psd-worker';
import { installedFonts, localFontAccess } from './localFonts';

/**
 * Owns the fonts for re-rendering type layers from their text. The worker keeps the font library across documents;
 * this factory reports what the open document needs from it (`report`: its fonts with their availability, its type
 * layers), the library itself (`library`), and the re-render support of the `selected` layer (`layerSupport`, asked
 * only for type layers and again whenever fonts are added). `addFiles` and `useInstalled` add fonts and record each
 * file the library refused in `refusals`; every addition invalidates the reports. `withFonts` makes renders that
 * re-render text run again when fonts arrive.
 */
export function createFonts(
  client: PsdClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  selected: Accessor<number | undefined>
) {
  // Bumped after every addition: the worker's library is not observable from here.
  const [revision, setRevision] = createSignal(0);
  const [refusals, setRefusals] = createSignal<FontRefusal[]>([]);
  const [adding, setAdding] = createSignal(false);
  const library = createMemo(() => {
    revision();
    return client.fonts();
  });
  const report = createMemo(() => {
    revision();
    const document = opened();
    return document?.ok ? client.documentFonts(document.value.document) : undefined;
  });
  const missing = createMemo(() => {
    const current = report();
    return current?.ok ? current.value.fonts.filter((font) => !font.available).map((font) => font.name) : [];
  });
  const layerSupport = createMemo(() => {
    revision();
    const document = opened();
    const index = selected();
    return document?.ok && index !== undefined && isTypeLayer(report(), index)
      ? client.textSupport(document.value.document, index)
      : undefined;
  });

  /** Whether the document has type layers and the library holds every font they use. */
  const ready = () => {
    const current = report();
    return Boolean(current?.ok && current.value.fonts.length && !missing().length);
  };

  /** Adds font files to the library; files it refuses are listed in `refusals` by name with the reason. */
  async function addFiles(files: readonly File[]) {
    setRefusals([]);
    if (!files.length) {
      return;
    }

    setAdding(true);
    try {
      const buffers = await Promise.all(files.map((file) => file.arrayBuffer()));
      const added = await client.addFonts(buffers);
      const refused = added.ok
        ? added.value.results.flatMap((result, index) =>
            result.ok ? [] : [{ file: files[index].name, reason: result.error.message }]
          )
        : [{ file: files.map((file) => file.name).join(', '), reason: added.error.message }];
      setRefusals(refused);
    } finally {
      setAdding(false);
      setRevision((current) => current + 1);
    }
  }

  /**
   * Asks the browser for the installed fonts the document is missing, by PostScript name, through the Local Font
   * Access API, and adds them. Must run in the user's click: the browser asks for permission on first use. A missing
   * font that is not installed stays missing; a refused permission is listed in `refusals`.
   */
  async function useInstalled() {
    const names = missing();
    // The query starts before any await, while the click's user activation lasts.
    const query = installedFonts(names);
    setAdding(true);
    try {
      const found = await query;
      const notInstalled = names.filter((name) => !found.some((font) => font.name === name));
      await addFiles(found.map((font) => font.file));
      setRefusals((current) => [
        ...current,
        ...notInstalled.map((name) => ({ file: name, reason: 'not installed on this computer' }))
      ]);
    } catch (error) {
      setRefusals([{ file: 'Installed fonts', reason: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setAdding(false);
    }
  }

  /**
   * `settings` for rendering: with `typeLayers` on, reading it also tracks the library, so the render runs again with
   * newly added fonts; renders from cached rasters do not.
   */
  function withFonts(settings: Accessor<PsdRenderSettings>): Accessor<PsdRenderSettings> {
    return () => {
      const current = settings();
      if (current.typeLayers) {
        revision();
      }

      return current;
    };
  }

  return {
    report,
    library,
    missing,
    ready,
    layerSupport,
    refusals,
    adding,
    canUseInstalled: localFontAccess,
    addFiles,
    useInstalled,
    withFonts
  };
}

/** A font file the library did not take, or a font that could not be fetched, with the reason. */
export type FontRefusal = { file: string; reason: string };

/** Whether record `index` is one of the type layers of a settled fonts report. */
function isTypeLayer(report: Awaited<ReturnType<PsdClient['documentFonts']>> | undefined, index: number) {
  return Boolean(report?.ok && report.value.layers.some((layer) => layer.index === index));
}
