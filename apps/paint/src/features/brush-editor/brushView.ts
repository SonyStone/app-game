import type { BrushFormValues } from '@app-game/abr-brush/form';
import type { Brush } from '@app-game/paint-core/brush';
import { brushSchema, parseDocument, type BrushDocument } from '@app-game/paint-core/paintbrush/document';
import { documentFormValues } from '../brush-library/abrDocument';
import { documentFamily, documentHost, documentImages, roundDocumentText } from '../brush-library/documentSettings';
import { chooseRenderPath } from '../brush-library/nativeDocument';

/**
 * What every row of the brush studio reads: one brush document, whatever kind of brush it is. Rows write by returning
 * the document's next text; see `BrushSetting`.
 */
export type BrushView = {
  /** The document's JSON text, which every write patches. */
  text: string;
  document: BrushDocument;
  /** The document's Photoshop form values, which the Photoshop groups read and write. */
  values: BrushFormValues;
  /**
   * The brush as the document holds it: Paint's own settings (size, opacity, flow, hardness, spacing, mixing, stroke,
   * pressure) from the document, over the live brush whose engine and colors it keeps.
   */
  brush: Brush;
  /** How the document encodes Paint's settings; see `documentFamily`. */
  family: ReturnType<typeof documentFamily>;
  /** Whether the document draws with the ABR (Photoshop) renderer rather than Paint's round one. */
  photoshopPath: boolean;
  /** Whether the document has the images a texture and a dual brush need; see `documentImages`. */
  images: ReturnType<typeof documentImages>;
};

/** The view of the document `text` for the live brush `live`; see {@link BrushView}. */
export function brushView(text: string, live: Brush): BrushView {
  const document = parseDocument(text, brushSchema);
  const values = documentFormValues(document);
  return {
    text,
    document,
    values,
    brush: documentHost(document, values, live),
    family: documentFamily(document),
    photoshopPath: chooseRenderPath(document).path === 'abr',
    images: documentImages(document)
  };
}

/** The view of a plain round `brush`: its own document, as a round preset without one would have. */
export function roundBrushView(brush: Brush): BrushView {
  return brushView(roundDocumentText(undefined, brush), brush);
}
