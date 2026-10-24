import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import { cellGap, pitch, type Part, type Span } from './board';
import styles from './LegoStudio.module.css';
import { lookChoicesBut, lookFits, resolveLook, spanKey } from './looks';
import { PartView, partLooks, type Session } from './parts';

/**
 * Chooses how `part` looks at its current size, showing every choice live and in miniature, like Android's widget
 * picker. "Auto" forgets the choice at this size; looks that do not fit it show the size they need and stay disabled
 * until the part grows. Choices apply at once, so the part behind shows them too.
 */
export function LookChooser(props: {
  part: Part;
  session: Session;
  /** Shows `look` at the part's size; `undefined` goes back to automatic. */
  onLook: (look: string | undefined) => void;
}) {
  const options = () => partLooks(props.part.kind);
  const span = () => props.part.span;
  const chosenHere = () => props.part.looks?.[spanKey(span())];
  /** What the part shows at this size with no choice made here. */
  const autoLook = () => {
    const found = options();
    if (!found) {
      return '';
    }

    return resolveLook(lookChoicesBut(props.part.looks, span()), span(), found.looks, found.auto(span()));
  };
  const label = (id: string) => options()?.looks.find((look) => look.id === id)?.label ?? id;

  return (
    <Show when={options()}>
      {(found) => (
        <div class={styles.chooser}>
          <h3>
            Look at {span().columns}×{span().rows}
          </h3>
          <div class={styles.choices}>
            <Choice label={`Auto: ${label(autoLook())}`} selected={!chosenHere()} onChoose={() => props.onLook(undefined)}>
              <PartPreview kind={props.part.kind} span={span()} look={autoLook()} session={props.session} />
            </Choice>
            <For each={found().looks}>
              {(look) => {
                const fitting = () => lookFits(look, span());
                return (
                  <Choice
                    label={look.label}
                    note={fitting() ? undefined : `from ${look.min.columns}×${look.min.rows}`}
                    selected={chosenHere() === look.id}
                    disabled={!fitting()}
                    onChoose={() => props.onLook(look.id)}
                  >
                    <PartPreview
                      kind={props.part.kind}
                      span={fitting() ? span() : look.min}
                      look={look.id}
                      session={props.session}
                    />
                  </Choice>
                );
              }}
            </For>
          </div>
        </div>
      )}
    </Show>
  );
}

/** Side of a choice's preview in CSS pixels. */
const previewSize = 96;

function Choice(props: {
  label: string;
  note?: string;
  selected: boolean;
  disabled?: boolean;
  onChoose: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class={styles.choice}
      data-selected={props.selected ? '' : undefined}
      disabled={props.disabled}
      aria-pressed={props.selected ? 'true' : 'false'}
      onClick={() => props.onChoose()}
    >
      {props.children}
      <span class={styles.choiceLabel}>{props.label}</span>
      <Show when={props.note}>
        <span class={styles.choiceNote}>{props.note}</span>
      </Show>
    </button>
  );
}

/** The part as it would show `look` at `span`, scaled down into a preview and not pressable. */
function PartPreview(props: { kind: string; span: Span; look: string; session: Session }) {
  const width = () => props.span.columns * pitch - cellGap;
  const height = () => props.span.rows * pitch - cellGap;
  const scale = () => Math.min(1, previewSize / width(), previewSize / height());

  return (
    <div class={styles.preview} inert>
      <div
        class={styles.previewTile}
        style={{ width: `${width()}px`, height: `${height()}px`, scale: `${scale()}` }}
      >
        <div class={styles.content}>
          <PartView kind={props.kind} span={props.span} look={props.look} session={props.session} onPopup={() => {}} />
        </div>
      </div>
    </div>
  );
}
