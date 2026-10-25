import type { JSX } from '@solidjs/web';
import type { Component } from 'solid-js';
import type { SketchIconName } from '../../../shared/ui/SketchIcon';
import type { Span } from '../board';
import type { LegoServices } from '../LegoServices';
import type { LookSpec } from '../looks';

/** Frame participation. Preview bindings are read-only; edit bindings keep their view mounted but inert. */
export type PartMode = 'live' | 'edit' | 'preview';

/** Transient board UI; part popups resolve from the same definition as their tile. */
export type Popup = { kind: 'part'; partKind: string } | { kind: 'looks'; id: string } | { kind: 'note'; text: string };

/** Host presentation and guarded callbacks, supplied to a binding under its frame owner. */
export type PartBinding = {
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
  /** Closes the current popup after a live command or file selection. */
  onDone: () => void;
};

/**
 * Defines inert registry data. `needs` runs only when mounted under PartFrame, and may create owned memos.
 * It must not start subscriptions, timers, uploads or worker requests itself. Views receive only selected props.
 * Document-engine resources belong to explicitly mounted live views and must be absent in previews. Previews may
 * use cacheable renderers that never mutate app state and cancel/ignore results on disposal or invisibility.
 * App mutations, including settings/storage writes, always use `frame.command`.
 */
export function definePart<N extends object, P extends object = N>(spec: {
  kind: string;
  family: 'color' | 'value' | 'action' | 'preset';
  label: string;
  icon?: SketchIconName;
  section: 'Tools' | 'Color' | 'Values' | 'Brushes';
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
  'kind' | 'family' | 'label' | 'icon' | 'section' | 'looks' | 'hasPopup' | 'render'
>;
