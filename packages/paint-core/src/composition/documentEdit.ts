import type { Layer, LayerInfo, TileChange } from '../document';
import type { FloatingPixels } from '../gpu/floatingPixels';
import type { TileData } from '../tilePixels';

/**
 * Defines a feature module's pixel edit, such as a bucket fill or a placed image: it reads the document and returns
 * the tile changes, and the runtime commits them as one undo step, updates the renderer and saves. Commands arrive as
 * `{ type: 'edit', edit: id, command, requestId? }`; the edit ends the stroke in progress first. A thrown error leaves
 * the document unchanged; it is reported as an error event, or with `requestId` in the `edited` reply, which also
 * carries the result's `reply`. A new edit needs no change to the runtime or its protocol.
 *
 * Interactive edits keep data between commands in `context.state`. They can update their own undo step with `amend`,
 * so the finished edit is one undo step however often it changed, or, like a transform, show their progress with
 * `context.floating` and commit only the result.
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
    /** A command for this edit, validated before it is sent; with `requestId`, the engine replies with `edited`. */
    command(command: Command, requestId?: string) {
      return {
        type: 'edit' as const,
        edit: definition.id,
        command: definition.parse(command),
        ...(requestId === undefined ? {} : { requestId })
      };
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
  /**
   * This edit's data kept between its commands, for example the pixels a transform started from. It lasts while the
   * runtime runs and is cleared when a document is imported.
   */
  state: { get: () => unknown; set: (value: unknown) => void };
  /**
   * Pixels lifted off a layer and shown moved while the edit is in progress, drawn by the renderer each frame; see
   * `FloatingPixels`. They never enter the document, its history or saved files, so the edit commits its result
   * itself. Importing a document clears them.
   */
  floating: {
    /** Shows lifted pixels, replacing any shown before, and redraws. */
    show(pixels: FloatingPixels): void;
    /** Moves the shown pixels and redraws; a `warp` bends them instead of `matrix`, see `FloatingPixels.warp`. */
    move(
      matrix: FloatingPixels['matrix'],
      interpolation: FloatingPixels['interpolation'],
      warp?: FloatingPixels['warp']
    ): void;
    /**
     * Stops showing the pixels once this command's changes are committed. Draws pending moves first, and with
     * changes keeps that frame on screen until the changed pixels have loaded, so they replace the floating pixels
     * without a blurred interim.
     */
    clear(): Promise<void>;
  };
};

/**
 * The changes of an edit. `layer` adds a new layer above the active one and selects it; changes may then refer to its
 * id. A change's `after` holds unpacked RGBA8 pixels, or `undefined` to clear the tile.
 *
 * `amend` replaces the undo step that this edit's previous command committed, which must still be the latest one:
 * that step is reverted first, so `before` of the changes is the state before it, and no changes remove the step.
 * `reply` is sent back to a command that carried a `requestId`.
 */
export type DocumentEditResult = { changes: TileChange[]; layer?: LayerInfo; amend?: boolean; reply?: unknown };

/** A document edit as the runtime sees it, with an untyped command; see {@link defineDocumentEdit}. */
export type DocumentEdit = {
  id: string;
  run: (context: DocumentEditContext, command: unknown) => Promise<DocumentEditResult>;
};
