import type { Brush } from '../brush';
import type { PaintRenderer } from './contracts';

/**
 * Defines a feature module that owns data of the document, such as paint symmetry: its validation and default, the
 * commands that change it, and how it decorates the renderer of a stroke. The runtime stores the data with the
 * document under the feature's `id`, in checkpoints and `.paint` files, and reports it with every state event, so a
 * new feature needs no change to the runtime or its protocol.
 *
 * Data must survive JSON, since `.paint` files store it in their JSON header. A runtime without the feature keeps the
 * feature's stored data unchanged.
 */
export function defineDocumentFeature<const Id extends string, Data, Command = never>(definition: {
  id: Id;
  /** Validates stored, imported or reported data; throws for data the feature cannot use. */
  parse: (input: unknown) => Data;
  /** Data of a new document, or of one stored before the feature existed. */
  initial: () => Data;
  /**
   * Changes the data. Commands arrive as `{ type: 'feature', feature: id, command }`; `parse` validates the untrusted
   * payload and `apply` returns the next data. A change ends the stroke in progress and marks the document unsaved;
   * it is not an undo step.
   */
  commands?: { parse: (input: unknown) => Command; apply: (data: Data, command: Command) => Data };
  /** Wraps the renderer for one stroke, for example to paint mirrored copies. Called at pen-down. */
  decorateStroke?: (context: { data: Data; brush: Brush; renderer: PaintRenderer }) => PaintRenderer;
}) {
  if (!definition.id.trim()) throw new Error('A document feature needs a nonempty ID.');
  const commands = definition.commands;
  const feature: DocumentFeature = {
    id: definition.id,
    parse: definition.parse,
    initial: definition.initial,
    ...(commands
      ? { apply: (data: unknown, command: unknown) => commands.apply(definition.parse(data), commands.parse(command)) }
      : {}),
    ...(definition.decorateStroke
      ? {
          decorateStroke: ({ data, brush, renderer }) =>
            definition.decorateStroke!({ data: definition.parse(data), brush, renderer })
        }
      : {})
  };

  return {
    ...feature,
    id: definition.id,
    /** The feature's data among a state event's `features`, or `undefined` when absent or invalid. */
    read(features: Readonly<Record<string, unknown>> | undefined): Data | undefined {
      if (!features || !Object.hasOwn(features, definition.id)) return undefined;
      try {
        return definition.parse(features[definition.id]);
      } catch {
        return undefined;
      }
    },
    /** A command for this feature, validated before it is sent. */
    command(command: Command) {
      return {
        type: 'feature' as const,
        feature: definition.id,
        command: commands ? commands.parse(command) : command
      };
    }
  };
}

/** A document feature as the runtime sees it, with untyped data; see {@link defineDocumentFeature}. */
export type DocumentFeature = {
  id: string;
  parse: (input: unknown) => unknown;
  initial: () => unknown;
  apply?: (data: unknown, command: unknown) => unknown;
  decorateStroke?: (context: { data: unknown; brush: Brush; renderer: PaintRenderer }) => PaintRenderer;
};

/**
 * Feature data of a document: registered features parse their stored data, falling back to their initial data when
 * it is absent or invalid; data of features the runtime does not have is kept as stored.
 */
export function restoreFeatureData(
  features: readonly DocumentFeature[],
  stored: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...stored };
  for (const feature of features) {
    data[feature.id] = Object.hasOwn(stored, feature.id) ? parseOr(feature, stored[feature.id]) : feature.initial();
  }

  return data;
}

function parseOr(feature: DocumentFeature, value: unknown) {
  try {
    return feature.parse(value);
  } catch {
    return feature.initial();
  }
}
