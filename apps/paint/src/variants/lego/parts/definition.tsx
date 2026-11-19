import type { JSX } from '@solidjs/web';
import type { Component } from 'solid-js';
import type { SketchIconName } from '../../../shared/ui/SketchIcon';
import type { Panel, Span } from '../board';
import type { LegoServices } from '../LegoServices';
import type { LookSpec } from '../looks';

/** Frame participation. Preview bindings are read-only; edit bindings keep their view mounted but inert. */
export type PartMode = 'live' | 'edit' | 'preview';

/** Transient board UI; part popups resolve from the same definition as their tile. */
export type Popup = { kind: 'part'; partKind: string } | { kind: 'looks'; id: string } | { kind: 'note'; text: string };

/** Host presentation and guarded callbacks, supplied to a binding under its frame owner. */
export type PartBinding = {
  /** Available tile width in CSS pixels. */
  readonly width: number;
  kind: string;
  span: Span;
  look: string;
  mode: PartMode;
  /** Guards commands by mode and reports synchronous and async failures. Read-only modes never invoke them. */
  command: <A extends unknown[]>(command: (...args: A) => unknown) => (...args: A) => void;
  /** Opens the requested popup in live mode, reporting failures through the session. */
  onPopup: (anchor: Element, popup: Popup) => void;
  /** Opens the part's owned panel in live mode. */
  onOpen: (anchor: Element) => void;
  /** Whether this part's owned folder is currently open. */
  open: boolean;
  /** Closes the current popup after a live command or file selection. */
  onDone: () => void;
};

/**
 * The parts that belong together on a plate, finer than a definition's `family`: neighbouring parts of one group fuse
 * into one block where the tile look fuses them (see `fusion.ts`). Every kind has exactly one group.
 *
 * - `brush`: what the pen draws with: a brush preset, the brush library, Brush settings.
 * - `tools`: what a stroke does instead of painting: eraser, lasso, fill, transform, local undo.
 * - `aids`: what shapes a stroke as it is drawn: symmetry, QuickShape.
 * - `pen`: the pen's own pressure: its curve and its calibration.
 * - `history`: undo and redo.
 * - `file`: the file commands.
 * - `colors`: the color itself and colors to take: swatch, fore/back, hex, history, palette, mixing.
 * - `color-pickers`: pickers and what shapes them: the picker, harmony, gamut mask.
 * - `color-channels`: one channel of the color each: hue, saturation, brightness, lightness.
 * - `brush-values`: one number of the brush each: size, opacity and every brush studio setting.
 * - `layer-props`: the active layer's own settings: name, blend mode, layer opacity.
 * - `layer-order`: lock, clip, up, down, merge down.
 * - `layer-manage`: add, duplicate, delete.
 * - `layer-list`: the list of layers.
 * - `layer-blending`: how the document mixes its colors (Smooth color).
 */
export type PartGroup =
  | 'brush'
  | 'tools'
  | 'aids'
  | 'pen'
  | 'history'
  | 'file'
  | 'colors'
  | 'color-pickers'
  | 'color-channels'
  | 'brush-values'
  | 'layer-props'
  | 'layer-order'
  | 'layer-manage'
  | 'layer-list'
  | 'layer-blending';

/**
 * Defines inert registry data. `needs` runs only when mounted under PartFrame, and may create owned memos.
 * It must not start subscriptions, timers, uploads or worker requests itself. Views receive only selected props.
 * Document-engine resources belong to explicitly mounted live views and must be absent in previews. Previews may
 * use cacheable renderers that never mutate app state and cancel/ignore results on disposal or invisibility.
 * App mutations, including settings/storage writes, always use `frame.command`.
 */
export function definePart<N extends object, P extends object = N>(spec: {
  /** Left out of the box: the part enters the board from elsewhere, as from the brush studio. */
  studioOnly?: boolean;
  kind: string;
  family: 'color' | 'value' | 'action' | 'preset';
  /** The parts this one fuses with when they lie side by side. */
  group: PartGroup;
  label: string;
  icon?: SketchIconName;
  section: 'Tools' | 'Color' | 'Values' | 'Brushes' | 'Layers';
  /** Composition supplied once when a new owner is taken from the box or spawn menu. */
  owned?: Pick<Panel, 'parts'>;
  looks?: { looks: readonly LookSpec[]; auto: (span: Span) => string };
  needs: (services: LegoServices, frame: PartBinding) => N;
  View: Component<N>;
  popup?: { needs: (services: LegoServices, frame: PartBinding) => P; View: Component<P> };
}) {
  return {
    ...spec,
    hasPopup: spec.popup !== undefined,
    render(services: LegoServices, frame: PartBinding, popup = false): JSX.Element {
      if (popup) {
        const Popup = spec.popup?.View;
        if (Popup && spec.popup) {
          const bound = spec.popup.needs(services, frame);
          return <Popup {...bound} />;
        }

        return undefined;
      }

      const View = spec.View;
      const bound = spec.needs(services, frame);
      return <View {...bound} />;
    }
  };
}

/** The uniform registry entry erases props only after `definePart` has checked needs against its view. */
export type PartDefinition = Pick<
  ReturnType<typeof definePart>,
  'studioOnly' | 'kind' | 'family' | 'group' | 'label' | 'icon' | 'section' | 'looks' | 'owned' | 'hasPopup' | 'render'
>;
