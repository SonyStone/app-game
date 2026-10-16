import type { JSX } from '@solidjs/web';
import { createMemo, For, Show } from 'solid-js';
import type { PaletteEntry } from './catalog';
import { typedKey, type Anchor, type TypeAheadApi } from './createTypeAhead';
import styles from './TypeAhead.module.css';

/**
 * The type-ahead's strip by the pointer (see `createTypeAhead`). After a shortcut key it shows the key, what is in use
 * now and the commands that go with it, as chips and color swatches; as a command line, the line and its rows; after
 * a command, what it did. It shows above the pen, away from the hand holding it, below a mouse pointer, and at the
 * bottom middle without either.
 */
export function TypeAhead(props: { typeAhead: TypeAheadApi }) {
  const { strip, offer, results, selected, hand, setQuery, move, run, runSelected, back, cancel, close, hover } =
    props.typeAhead;
  const line = () => {
    const open = strip();
    return open?.mode === 'search' ? open : undefined;
  };
  const shortcut = () => {
    const open = strip();
    return open?.mode === 'offer' ? open : undefined;
  };
  const done = () => {
    const open = strip();
    return open?.mode === 'done' ? open : undefined;
  };
  /** The offer's non-empty sections, each with the index of its first entry among all of them. */
  const sections = createMemo(() => {
    let start = 0;
    return (offer()?.sections ?? [])
      .filter((section) => section.entries.length > 0)
      .map((section) => {
        const placed = { ...section, start };
        start += section.entries.length;
        return placed;
      });
  });

  const onLineKey: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (event) => {
    if (event.isComposing) {
      return;
    }

    const input = event.currentTarget;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!runSelected()) {
        close();
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Backspace' && input.value === '') {
      event.preventDefault();
      back();
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      // Commands are English: a non-Latin layout types the Latin letter of the key.
      const latin = typedKey(event);
      if (latin !== event.key.toLowerCase() && /^[ -~]$/.test(latin)) {
        event.preventDefault();
        input.setRangeText(
          latin,
          input.selectionStart ?? input.value.length,
          input.selectionEnd ?? input.value.length,
          'end'
        );
        setQuery(input.value);
      }
    }
  };

  return (
    <Show when={strip()}>
      {(open) => (
        <section
          class={styles.strip}
          data-type-ahead
          data-mode={open().mode}
          aria-label="Commands"
          style={placement(open().anchor, hand())}
          onPointerEnter={() => hover(true)}
          onPointerLeave={() => hover(false)}
        >
          <Show when={shortcut()}>
            {(offered) => (
              <>
                <header class={styles.head}>
                  <kbd class={styles.key}>{keyLabel(offered().key)}</kbd>
                  <span class={styles.title}>{offer()?.title}</span>
                </header>
                <For each={sections()} keyed={false}>
                  {(section) => (
                    <div
                      class={section().look === 'swatches' ? styles.swatches : styles.chips}
                      role="group"
                      aria-label={section().title}
                    >
                      <For each={section().entries} keyed={false}>
                        {(entry, index) => (
                          <EntryButton
                            entry={entry()}
                            swatch={section().look === 'swatches'}
                            selected={section().start + index === selected()}
                            onRun={() => void run(entry())}
                          />
                        )}
                      </For>
                    </div>
                  )}
                </For>
                <p class={styles.hint}>
                  {offer()?.value?.direct ? 'Type a size, or ' : ''}
                  <kbd>Space</kbd> to type · <kbd>Esc</kbd> undoes
                </p>
              </>
            )}
          </Show>
          <Show when={line()}>
            {(typing) => (
              <>
                <div class={styles.line}>
                  <Show when={typing().key}>{(key) => <kbd class={styles.key}>{keyLabel(key())}</kbd>}</Show>
                  <input
                    ref={(element) => queueMicrotask(() => element.focus())}
                    class={styles.input}
                    type="text"
                    role="combobox"
                    aria-label="Command"
                    aria-expanded={results().length > 0 ? 'true' : 'false'}
                    aria-controls="type-ahead-rows"
                    enterkeyhint="go"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck={false}
                    placeholder={offer()?.prompt ?? 'A command: new layer, red, zoom 200'}
                    value={typing().query}
                    onInput={(event) => setQuery(event.currentTarget.value)}
                    onKeyDown={onLineKey}
                  />
                </div>
                <Show when={offer() && !typing().query.trim()}>
                  <p class={styles.title}>{offer()?.title}</p>
                </Show>
                <div class={styles.rows} id="type-ahead-rows" role="listbox" aria-label="Commands found">
                  <For each={results()} keyed={false}>
                    {(entry, index) => (
                      <button
                        class={styles.row}
                        role="option"
                        aria-selected={index === selected() ? 'true' : 'false'}
                        tabindex={-1}
                        onClick={() => void run(entry())}
                      >
                        <Show when={entry().swatch}>
                          <span class={styles.dot} style={{ background: entry().swatch }} />
                        </Show>
                        <span class={styles.rowTitle}>{entry().title}</span>
                        <Show when={entry().detail}>
                          <span class={styles.detail}>{entry().detail}</span>
                        </Show>
                        <Show when={entry().shortcut}>
                          <kbd>{entry().shortcut}</kbd>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
                <Show when={typing().query.trim() && results().length === 0}>
                  <p class={styles.hint}>No command matches.</p>
                </Show>
                <p class={styles.hint}>
                  <kbd>↵</kbd> runs · <kbd>Esc</kbd> undoes
                </p>
              </>
            )}
          </Show>
          <Show when={done()}>
            {(ran) => (
              <p class={styles.done} role="status" data-failed={ran().outcome.ok ? undefined : ''}>
                {ran().outcome.message}
              </p>
            )}
          </Show>
        </section>
      )}
    </Show>
  );
}

/** A chip or a color swatch of the offer; `selected` marks the keyboard's row. */
function EntryButton(props: { entry: PaletteEntry; swatch: boolean; selected: boolean; onRun: () => void }) {
  return (
    <Show
      when={props.swatch}
      fallback={
        <button
          class={styles.chip}
          aria-pressed={props.entry.current ? 'true' : undefined}
          data-selected={props.selected ? '' : undefined}
          onClick={() => props.onRun()}
        >
          {props.entry.title}
          <Show when={props.entry.shortcut}>
            <kbd>{props.entry.shortcut}</kbd>
          </Show>
        </button>
      }
    >
      <button
        class={styles.swatch}
        style={{ background: props.entry.swatch }}
        aria-label={props.entry.title}
        title={props.entry.title}
        aria-pressed={props.entry.current ? 'true' : undefined}
        data-selected={props.selected ? '' : undefined}
        onClick={() => props.onRun()}
      />
    </Show>
  );
}

/**
 * Where the strip goes for `anchor`: above the pen and to the side away from the `hand` holding it, below and right of
 * a mouse pointer, flipping where the room runs out; at the bottom middle without a pointer.
 */
function placement(anchor: Anchor | undefined, hand: 'left' | 'right'): JSX.CSSProperties {
  if (!anchor) {
    return {
      left: `${Math.max(gap, innerWidth / 2 - width / 2)}px`,
      bottom: '72px',
      'max-height': `${innerHeight - 80}px`
    };
  }

  const pen = anchor.pointer !== 'mouse';
  const left = pen ? (hand === 'right' ? anchor.x - offset - width : anchor.x + offset) : anchor.x + 14;
  const x = `${Math.min(Math.max(gap, left), Math.max(gap, innerWidth - width - gap))}px`;
  const above = anchor.y - offset - gap;
  const below = innerHeight - anchor.y - offset - gap;
  if ((pen && above >= minHeight) || (!pen && below < minHeight && above > below)) {
    return { left: x, bottom: `${innerHeight - anchor.y + offset}px`, 'max-height': `${above}px` };
  }

  return { left: x, top: `${anchor.y + offset}px`, 'max-height': `${Math.max(minHeight, below)}px` };
}

/** A key as its cap reads: `B`, `[`. */
function keyLabel(key: string) {
  return key.toUpperCase();
}

/** CSS pixels: the strip's width, its distance from the pointer and the page's edges, and the least height it wants. */
const width = 300;
const offset = 20;
const gap = 8;
const minHeight = 180;
