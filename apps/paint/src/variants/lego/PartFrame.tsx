import { createVisibilityObserver } from '@solid-primitives/intersection-observer';
import type { JSX } from '@solidjs/web';
import { createSignal, Errored, Show, useContext, type Accessor } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { Span } from './board';
import { LegoServicesContext } from './LegoServices';
import styles from './LegoStudio.module.css';
import { partDefinition } from './parts';
import type { PartBinding, PartMode, Popup } from './parts/definition';

/**
 * Common host for board parts, ghosts, box/kit previews, chooser looks and popups. Owns failure isolation and mode,
 * never the session. Edit keeps its view mounted and inert. Preview bindings are read-only and mounted only while
 * near the viewport; offscreen subtrees are disposed and remounted on re-entry. Carried previews mount immediately.
 *
 * Preview may read state and request cacheable rendering through the shared preview service. Rendering must not
 * change app/document state, and pending results must be cancelled or ignored on disposal or invisibility.
 * Preview must not run commands, acquire document-engine resources such as layerThumbnails.want, start timers or
 * subscriptions that mutate app state, or write storage/preferences. Only bindings read the services context.
 */
export function PartFrame(props: {
  kind?: string;
  span?: Span;
  look?: string;
  mode?: PartMode;
  /** Mounts carried previews immediately, without waiting for visibility observation. */
  immediate?: boolean;
  missing?: boolean;
  popup?: boolean;
  onPopup?: (anchor: Element, popup: Popup) => void;
  onOpen?: (anchor: Element) => void;
  onDone?: () => void;
  children?: JSX.Element;
}) {
  const [element, setElement] = createSignal<HTMLElement>();

  return (
    <div
      ref={setElement}
      class={styles.partFrame}
      data-part-kind={props.kind}
      data-mode={props.mode ?? 'live'}
      inert={props.mode === 'edit' || props.mode === 'preview' || undefined}
    >
      <Errored
        fallback={(_error, reset) => (
          <button
            type="button"
            class={styles.brokenPart}
            aria-label={`Broken part: ${props.kind ?? 'Part'}. Retry`}
            title={`${props.kind ?? 'Part'} failed. Tap to retry.`}
            onClick={reset}
          >
            <Show when={!props.span || props.span.columns >= 2} fallback={<SketchIcon name="reset" />}>
              <span>Broken part</span>
              <span>{props.kind}</span>
              <span>Retry</span>
            </Show>
          </button>
        )}
      >
        <Show when={props.mode === 'preview' && !props.immediate} fallback={props.children ?? <Binding {...props} />}>
          <VisiblePreview element={element}>{props.children ?? <Binding {...props} />}</VisiblePreview>
        </Show>
      </Errored>
    </div>
  );
}

/** Keeps observing the host while its expensive subtree is disposed, then remounts it on re-entry. */
function VisiblePreview(props: { element: Accessor<HTMLElement | undefined>; children: JSX.Element }) {
  const visible = createVisibilityObserver(props.element, { initialValue: false, rootMargin: '96px' });

  return <Show when={visible()}>{props.children}</Show>;
}

/** Runs a definition under the mounted frame owner; only this boundary receives app capabilities. */
function Binding(props: Parameters<typeof PartFrame>[0]) {
  const services = useContext(LegoServicesContext);
  const definition = () => (props.missing ? undefined : partDefinition(props.kind ?? ''));
  const frame: PartBinding = {
    get kind() {
      return props.kind ?? '';
    },
    get span() {
      return props.span ?? { columns: 1, rows: 1 };
    },
    get look() {
      return props.look ?? definition()?.looks?.auto(frame.span) ?? '';
    },
    get mode() {
      return props.mode ?? 'live';
    },
    command:
      (command) =>
      (...args) => {
        if (frame.mode === 'live') {
          services.run(() => command(...args));
        }
      },
    onPopup: (anchor, popup) => {
      if (frame.mode === 'live') {
        services.run(() => props.onPopup?.(anchor, popup));
      }
    },
    onOpen: (anchor) => {
      if (frame.mode === 'live') {
        services.run(() => props.onOpen?.(anchor));
      }
    },
    onDone: () => {
      if (frame.mode === 'live') {
        services.run(() => props.onDone?.());
      }
    }
  };

  return (
    <Show when={definition()} keyed fallback={<MissingPart kind={frame.kind} span={frame.span} />}>
      {(found) => found.render(services, frame, props.popup)}
    </Show>
  );
}

/** Retains a tile for an unavailable kind or malformed stored record. */
export function MissingPart(props: { kind: string; span?: Span }) {
  return (
    <span
      class={styles.brokenPart}
      role="img"
      aria-label={`Missing part: ${props.kind}`}
      title={`Missing part: ${props.kind}`}
    >
      ?
      <Show when={!props.span || props.span.columns >= 2}>
        <span>{props.kind}</span>
      </Show>
    </span>
  );
}
