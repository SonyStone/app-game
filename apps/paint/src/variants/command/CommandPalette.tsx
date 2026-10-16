import type { JSX } from '@solidjs/web';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import type { Intent, PaletteEntry } from '../../features/commands';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import styles from './CommandPalette.module.css';

/** How a palette row was chosen: a tap or click keeps the palette open for repeatable commands such as Undo. */
export type RunVia = 'enter' | 'tap';

/**
 * The command palette, the variant's only panel, at the top of the screen. One line takes a typed command; under it a
 * line says what Enter will run, then the matching rows, the selected one marked with ↵. Arrow keys choose a row, Tab
 * copies its title into the line, Enter runs it. With an empty line the palette shows big chips instead, for a finger
 * or the pen: recent and suggested commands, colors and brushes. The state line on top shows the brush, color, layer
 * and view, and each part opens the rows that change it. A microphone button speaks a command where the browser can.
 * The palette does not run anything itself; `onRun` does.
 */
export function CommandPalette(props: {
  query: string;
  onQuery: (query: string) => void;
  /** Rows for the current query, best first; the first is what Enter runs. */
  entries: readonly PaletteEntry[];
  /** Chips for an empty query, by section; empty sections are left out. */
  chips: readonly { title: string; entries: readonly PaletteEntry[]; swatches?: boolean }[];
  /**
   * The current state, as parts of the state line: a value, emphasized, with its unit or detail and an optional color
   * swatch, and the query that lists the commands changing it.
   */
  status: readonly { value: string; unit?: string; swatch?: string; query: string; title: string }[];
  /** Focuses the command line on opening, for a keyboard; a finger or pen opens it without the on-screen keyboard. */
  autofocus: boolean;
  voice: { supported: boolean; listening: boolean; heard: string };
  onVoice: () => void;
  onRun: (intents: Intent[], via: RunVia) => void;
  onClose: () => void;
  /** The playground page, linked from the footer when there is one. */
  playground?: string;
}) {
  // A new query selects its first row again.
  const [selected, setSelected] = createSignal(() => {
    void props.query;
    return 0;
  });
  const help = () => /^(?:help|\?)$/i.test(props.query.trim());
  const current = () => props.entries[Math.min(selected(), props.entries.length - 1)];
  let list: HTMLDivElement | undefined;

  /** Moves the selection by `step` rows, wrapping around, and keeps the row in view. */
  const move = (step: number) => {
    const count = props.entries.length;
    if (count === 0) {
      return;
    }

    const next = (((Math.min(selected(), count - 1) + step) % count) + count) % count;
    setSelected(next);
    list?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (event) => {
    if (event.isComposing) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Tab' && current()) {
      event.preventDefault();
      props.onQuery(current()!.title);
    } else if (event.key === 'Enter' && current() && !help()) {
      event.preventDefault();
      props.onRun(current()!.intents, 'enter');
    }
  };

  return (
    <div class={styles.palette} role="dialog" aria-label="Commands" data-palette>
      <div class={styles.line}>
        <span class={styles.prompt} aria-hidden="true">
          /
        </span>
        <input
          ref={(element) => {
            if (props.autofocus) {
              queueMicrotask(() => element.focus());
            }
          }}
          class={styles.input}
          type="text"
          enterkeyhint="go"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          placeholder={props.voice.listening ? 'Listening…' : 'Type a command: size 24, red, new layer, help'}
          aria-label="Command"
          aria-controls="command-rows"
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <Show when={props.query}>
          <button class={styles.iconButton} aria-label="Clear" title="Clear" onClick={() => props.onQuery('')}>
            <SketchIcon name="close" size={16} />
          </button>
        </Show>
        <Show when={props.voice.supported}>
          <button
            class={styles.iconButton}
            aria-label="Speak a command"
            title="Speak a command"
            aria-pressed={props.voice.listening ? 'true' : 'false'}
            onClick={() => props.onVoice()}
          >
            <MicIcon />
          </button>
        </Show>
      </div>
      <Switch>
        <Match when={props.voice.listening}>
          <p class={styles.preview} role="status">
            <span class={styles.pulse} />
            {props.voice.heard ? `“${props.voice.heard}”` : 'Listening… say a command'}
          </p>
        </Match>
        <Match when={props.query.trim() && !help()}>
          <p class={styles.preview} role="status">
            <Show when={current()} fallback={<span class={styles.dim}>No command matches. Try “help”.</span>}>
              {(entry) => (
                <>
                  <kbd class={styles.enter}>↵</kbd>
                  <span class={styles.previewTitle}>{entry().title}</span>
                  <Show when={props.voice.heard && props.voice.heard === props.query}>
                    <span class={styles.dim}>heard</span>
                  </Show>
                </>
              )}
            </Show>
          </p>
        </Match>
      </Switch>
      <div class={styles.status} role="toolbar" aria-label="Current state">
        <For each={props.status}>
          {(part) => (
            <button class={styles.statusPart} title={part.title} onClick={() => props.onQuery(part.query)}>
              <Show when={part.swatch}>
                <span class={styles.dot} style={{ background: part.swatch }} />
              </Show>
              <strong>{part.value}</strong>
              {part.unit}
            </button>
          )}
        </For>
      </div>
      <div ref={list} class={styles.body} id="command-rows">
        <Switch>
          <Match when={help()}>
            <Help onExample={props.onQuery} voice={props.voice.supported} />
          </Match>
          <Match when={!props.query.trim()}>
            <For each={props.chips.filter((section) => section.entries.length > 0)}>
              {(section) => (
                <section class={styles.section}>
                  <h3>{section.title}</h3>
                  <div class={section.swatches ? styles.swatches : styles.chips}>
                    <For each={section.entries}>
                      {(entry) =>
                        section.swatches ? (
                          <button
                            class={styles.swatch}
                            style={{ background: entry.swatch }}
                            aria-current={entry.current ? 'true' : undefined}
                            aria-label={entry.title}
                            title={entry.title}
                            onClick={() => props.onRun(entry.intents, 'tap')}
                          />
                        ) : (
                          <button
                            class={styles.chip}
                            aria-current={entry.current ? 'true' : undefined}
                            onClick={() => props.onRun(entry.intents, 'tap')}
                          >
                            <Show when={entry.swatch}>
                              <span class={styles.dot} style={{ background: entry.swatch }} />
                            </Show>
                            {entry.title}
                          </button>
                        )
                      }
                    </For>
                  </div>
                </section>
              )}
            </For>
          </Match>
          <Match when={props.entries.every((entry) => entry.swatch !== undefined) && props.entries.length > 1}>
            <div class={styles.swatches} role="listbox" aria-label="Colors">
              <For each={props.entries} keyed={false}>
                {(entry, index) => (
                  <button
                    class={styles.swatch}
                    role="option"
                    data-index={index}
                    aria-selected={index === selected() ? 'true' : 'false'}
                    style={{ background: entry().swatch }}
                    aria-label={entry().title}
                    title={entry().title}
                    onClick={() => props.onRun(entry().intents, 'tap')}
                  />
                )}
              </For>
            </div>
          </Match>
          <Match when={true}>
            <div role="listbox" aria-label="Commands">
              <For each={props.entries} keyed={false} fallback={<p class={styles.empty}>Nothing found.</p>}>
                {(entry, index) => (
                  <div
                    class={styles.row}
                    role="option"
                    data-index={index}
                    aria-selected={index === selected() ? 'true' : 'false'}
                  >
                    <button
                      class={styles.rowMain}
                      tabindex={-1}
                      onPointerMove={(event) => {
                        // A moving mouse chooses the row; a row appearing under a resting pointer does not.
                        if (event.pointerType === 'mouse' && (event.movementX !== 0 || event.movementY !== 0)) {
                          setSelected(index);
                        }
                      }}
                      onClick={() => props.onRun(entry().intents, 'tap')}
                    >
                      <span class={styles.icon}>
                        <Show
                          when={entry().swatch}
                          fallback={<SketchIcon name={groupIcons[entry().group] ?? 'more'} size={16} />}
                        >
                          <span class={styles.dot} style={{ background: entry().swatch }} />
                        </Show>
                      </span>
                      <span class={styles.title}>
                        {entry().title}
                        <Show when={entry().detail}>
                          <span class={styles.detail}>{entry().detail}</span>
                        </Show>
                      </span>
                      <span class={styles.group}>{entry().group}</span>
                      <Show when={entry().shortcut}>
                        <kbd class={styles.shortcut}>{entry().shortcut}</kbd>
                      </Show>
                    </button>
                    <Show when={entry().secondary}>
                      {(secondary) => (
                        <button
                          class={styles.iconButton}
                          aria-label={secondary().label}
                          title={secondary().label}
                          aria-pressed={secondary().pressed ? 'true' : 'false'}
                          onClick={() => props.onRun(secondary().intents, 'tap')}
                        >
                          <SketchIcon name={secondary().pressed ? 'eye' : 'hidden'} size={16} />
                        </button>
                      )}
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </div>
      <footer class={styles.footer}>
        <span class={styles.keys}>↑↓ choose · ↵ run · Tab complete · Esc close</span>
        <Show when={props.playground}>
          {(href) => (
            <a class={styles.link} href={href()}>
              Playground
            </a>
          )}
        </Show>
        <button class={styles.closeButton} onClick={() => props.onClose()}>
          Close
        </button>
      </footer>
    </div>
  );
}

/** Example commands, which a tap copies into the command line, and the gestures. */
function Help(props: { onExample: (query: string) => void; voice: boolean }) {
  return (
    <div class={styles.help}>
      <section class={styles.section}>
        <h3>Try</h3>
        <div class={styles.chips}>
          <For each={examples}>
            {(example) => (
              <button class={styles.chip} onClick={() => props.onExample(example)}>
                {example}
              </button>
            )}
          </For>
        </div>
      </section>
      <section class={styles.section}>
        <h3>Open the commands</h3>
        <dl class={styles.gestures}>
          <For each={props.voice ? [...gestures, voiceGesture] : gestures}>
            {(gesture) => (
              <>
                <dt>{gesture[0]}</dt>
                <dd>{gesture[1]}</dd>
              </>
            )}
          </For>
        </dl>
      </section>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

const groupIcons: Record<string, SketchIconName> = {
  Tool: 'tools',
  Brush: 'brush',
  Color: 'picker',
  Layer: 'layers',
  Selection: 'select',
  View: 'zoom',
  Symmetry: 'symmetry',
  History: 'undo',
  File: 'paper',
  Mixer: 'brush',
  Paint: 'more',
  Commands: 'numbers'
};

const examples = [
  'size 24',
  'bigger',
  'opacity 50',
  'dark blue',
  '#ff8800',
  'new layer',
  'hide layer 2',
  'layer 3 opacity 40',
  'zoom 200',
  'rotate 0',
  'mirror',
  'symmetry radial 8',
  'undo 5',
  'export png',
  'red, size 12'
];

const gestures: readonly (readonly [string, string])[] = [
  ['/ or Ctrl K', 'Open the commands; ? opens this help.'],
  ['The corner button', 'Tap to open the commands.'],
  ['Two-finger hold', 'Open the commands.'],
  ['Two-finger tap', 'Undo. Three fingers redo.'],
  ['One-finger hold', 'Pick a color under the finger.'],
  ['Pinch, twist, drag', 'Zoom, rotate and move the view.'],
  ['Space, right button, pen button', 'The navigation puck.']
];

const voiceGesture = ['Hold the corner button', 'Speak a command; let go when done.'] as const;
