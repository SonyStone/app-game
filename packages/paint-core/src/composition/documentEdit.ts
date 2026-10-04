import type { Layer, LayerInfo, TileChange } from '../document';
import type { TileData } from '../tilePixels';

/**
 * Defines a feature module's pixel edit, such as a bucket fill or a placed image: it reads the document and returns
 * the tile changes, and the runtime commits them as one undo step, updates the renderer and saves. Commands arrive as
 * `{ type: 'edit', edit: id, command }`; the edit ends the stroke in progress first. A thrown error leaves the document
 * unchanged and is reported as an error event. A new edit needs no change to the runtime or its protocol.
 *
 * Edits run in the engine's realm, a worker or the main thread, so they must not use the DOM.
 */
export function defineDocumentEdit<const Id extends string, Command>(definition: {
  id: Id;
  /** Validates the untrusted command payload. */
  parse: (input: unknown) => Command;
  /** Computes the edit. Return no changes to leave the document and its history unchanged. */
  run: (context: DocumentEditContext, command: Command) => Promise<DocumentEditResult>;
}) {
  if (!definition.id.trim()) throw new Error('A document edit needs a nonempty ID.');
  const edit: DocumentEdit = {
    id: definition.id,
    run: (context, command) => definition.run(context, definition.parse(command))
  };

  return {
    ...edit,
    id: definition.id,
    /** A command for this edit, validated before it is sent. */
    command(command: Command) {
      return { type: 'edit' as const, edit: definition.id, command: definition.parse(command) };
    }
  };
}

/** What an edit reads: the document's layers and a reader for their tiles. */
export type DocumentEditContext = {
  /** Current layers, bottom to top. Tiles are immutable; replace them through the returned changes. */
  layers: readonly Layer[];
  /** The selected layer, among `layers`. */
  active: Layer;
  /** Unpacked premultiplied sRGB RGBA8 pixels of a tile, reading paged-out tiles from storage. */
  readTile: (pixels: TileData) => Promise<Uint8Array>;
};

/**
 * The changes of an edit. `layer` adds a new layer above the active one and selects it; changes may then refer to its
 * id. A change's `after` holds unpacked RGBA8 pixels, or `undefined` to clear the tile.
 */
export type DocumentEditResult = { changes: TileChange[]; layer?: LayerInfo };

/** A document edit as the runtime sees it, with an untyped command; see {@link defineDocumentEdit}. */
export type DocumentEdit = {
  id: string;
  run: (context: DocumentEditContext, command: unknown) => Promise<DocumentEditResult>;
};
