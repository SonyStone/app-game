import { editable } from '@app-game/paint-core/input';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PaintSession } from '../session';
import { parsedEntry, searchPalette, type PaletteContext, type PaletteEntry } from './catalog';
import { intentKey, parseCommand, repeatable, type Intent } from './commands';
import { summarize, type Outcome } from './createCommandRunner';
import { keyContext, sessionKeys, type KeyContextId } from './keyContexts';

/**
 * Commands typed beside the keyboard shortcuts, for a variant used with a keyboard. A shortcut key does what it always
 * did (B chooses the brush), and a strip by the pointer offers what goes with it (`keyContext`): for B smaller and
 * bigger, sizes, the recent brushes and colors; for L the selection tools; for X the colors. A press on the strip runs
 * a command, as do ↑↓ and Enter. Space after the key, or a digit after a brush key, turns the strip into a command
 * line within that context: `B 12` paints 12 px wide, `B soft` finds the Soft round brush, `E 40` sizes the eraser.
 * A letter that is no shortcut starts a command line of its own (`new layer`, `export png`, `hide layer 2`), as does
 * `search`; a letter right after a shortcut key spells a word with it instead (`bi` for Bigger), taking back what that
 * key did.
 *
 * Escape takes back what the keys and commands changed since the strip opened (the tool, brushes, colors and view, and
 * what `remember` covers) and closes it. A press anywhere else, or `offerMs` without a key, closes the strip and keeps
 * what was done; another shortcut key runs and shows its own context. A command run from the line closes the strip,
 * which says what it did for a moment; a repeatable one tapped in the offer, such as Bigger, keeps it open.
 *
 * Listens on `window` in the capture phase, so it must be created before the variant's own key listeners: it
 * remembers the state before a shortcut changes it, and keeps the keys it uses from them. Text fields and open dialogs
 * are left alone. Must be created within a Solid owner.
 */
export function createTypeAhead(options: {
  session: PaintSession;
  /** Runs commands; see `createCommandRunner`. */
  run: (intents: readonly Intent[]) => Promise<Outcome[]>;
  /** Called after a command ran, as for remembering recent commands. */
  onRan?: (intents: readonly Intent[], outcomes: readonly Outcome[]) => void;
  /** The parser's and the search's view of the drawing. */
  context: () => PaletteContext;
  /** Recent colors, newest first, offered with the brush and color keys. */
  colors: () => readonly string[];
  /** The variant's own single-key shortcuts beyond the session's, by lower-case key; see `sessionKeys`. */
  keys?: Readonly<Record<string, KeyContextId>>;
  /** Remembers the variant's own state that its keys change, returning what puts it back on Escape. */
  remember?: () => () => void;
  /** Whether keys open the strip now; always when omitted. */
  enabled?: () => boolean;
}) {
  const { session } = options;
  const keys = { ...sessionKeys, ...options.keys };
  const [strip, setStrip, current] = createImmediateSignal<TypeAheadStrip | undefined>(undefined);
  const offer = createMemo(() => {
    const open = strip();
    const id = open && open.mode !== 'done' ? open.context : undefined;
    return id ? keyContext(id, session, options.context(), options.colors()) : undefined;
  });
  const offered = createMemo(() => offer()?.sections.flatMap((section) => section.entries) ?? []);
  const results = createMemo(() => {
    const open = strip();
    return open?.mode === 'search' ? find(open.query) : [];
  });
  // The keyboard's row: none in the offer until an arrow key, the first of a command line's results once typed.
  const [selected, setSelected] = createSignal<number>(() => {
    const open = strip();
    return open?.mode === 'search' && open.query.trim() ? 0 : -1;
  });
  /** The last pointer over the page, where the strip shows. */
  let pointer: Anchor | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false;
  let running = false;

  createEventListener(window, 'keydown', onKey, { capture: true });
  for (const type of ['pointermove', 'pointerdown'] as const) {
    createEventListener(
      window,
      type,
      (event) => {
        pointer = { x: event.clientX, y: event.clientY, pointer: event.pointerType };
      },
      { capture: true, passive: true }
    );
  }

  // A press anywhere but on the strip closes it, keeping what was done; the press goes on, so the pen paints.
  createEventListener(
    document,
    'pointerdown',
    (event) => {
      if (current() && !(event.target instanceof Element && event.target.closest('[data-type-ahead]'))) {
        close();
      }
    },
    { capture: true }
  );
  createEventListener(window, 'blur', () => close());
  onCleanup(() => clearTimeout(timer));
  // The brushes offered and searched include the user's presets once they have been read.
  createEffect(
    () => strip() !== undefined,
    (open) => {
      if (open) {
        void session.library.loadAll();
      }
    }
  );

  return {
    /** The open strip, or `undefined`. */
    strip,
    /** What goes with the shortcut key the strip is about, also behind a command line started from one. */
    offer,
    /** The command line's rows, best first: a number typed after a key, then what the parser and search find. */
    results,
    /** The keyboard's row: an index into the offer's entries, in section order, or into `results`; −1 for none. */
    selected,
    /** The hand that holds the pen, whose side the strip avoids. */
    hand: () => session.palmSettings.settings().hand,
    /** Opens the command line with `query`, without a shortcut key; Ctrl/Cmd+K in a variant, say. */
    search(query = '') {
      const open = current();
      setStrip({
        mode: 'search',
        query,
        anchor: open?.anchor ?? anchor(),
        revert: open && open.mode !== 'done' ? open.revert : remember()
      });
    },
    /** Replaces the command line's text. */
    setQuery(query: string) {
      const open = current();
      if (open?.mode === 'search') {
        setStrip({ ...open, query });
      }
    },
    /** Moves the keyboard's row by `step`, wrapping around. */
    move,
    /** Runs a row of the offer or the command line. */
    run,
    /** Runs the keyboard's row; returns whether there was one. */
    runSelected() {
      const rows = current()?.mode === 'search' ? results() : offered();
      const row = rows[selected()];
      if (row) {
        void run(row);
      }

      return row !== undefined;
    },
    /** Backspace in an empty command line: back to the offer of the key it started from, or closed. */
    back() {
      const open = current();
      if (open?.mode !== 'search') {
        return;
      }

      if (open.context) {
        setStrip({
          mode: 'offer',
          context: open.context,
          key: open.key ?? '',
          fresh: false,
          anchor: open.anchor,
          revert: open.revert
        });
        schedule();
        return;
      }

      close();
    },
    /** Escape: takes back what changed since the strip opened, and closes it. */
    cancel,
    /** Closes the strip, keeping what was done. */
    close,
    /** The pointer is over the strip, which then stays open; `false` when it leaves. */
    hover(over: boolean) {
      hovered = over;
      schedule();
    }
  };

  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || !(options.enabled?.() ?? true)) {
      return;
    }

    if (editable(event.target) || (event.target instanceof Element && event.target.closest('dialog[open]'))) {
      return;
    }

    const open = current();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      if (open?.mode === 'offer' || open?.mode === 'done') {
        close();
      }

      return;
    }

    const key = typedKey(event);
    const context = event.shiftKey ? undefined : keys[key];
    if (open?.mode === 'offer') {
      offerKey(event, open, key, context);
      return;
    }

    if (open?.mode === 'search') {
      // Focus left the line, as after a press on the strip; only Escape still applies.
      if (event.key === 'Escape') {
        consume(event);
        cancel();
      }

      return;
    }

    if (context) {
      // Remembered before the variant's listeners run the shortcut.
      setStrip({ mode: 'offer', context, key, fresh: true, anchor: anchor(), revert: remember() });
      schedule();
      return;
    }

    if (isLetter(key) && !event.shiftKey && !event.repeat) {
      consume(event);
      setStrip({ mode: 'search', query: key, anchor: anchor(), revert: remember() });
    }
  }

  /** A key while the offer shows, before the variant's shortcuts see it. */
  function offerKey(event: KeyboardEvent, open: OfferStrip, key: string, context: KeyContextId | undefined) {
    if (event.key === 'Escape') {
      consume(event);
      cancel();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      consume(event);
      move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter') {
      const row = offered()[selected()];
      if (row) {
        consume(event);
        void run(row);
      } else {
        close();
      }

      return;
    }

    if (key === ' ') {
      consume(event);
      setStrip({
        mode: 'search',
        context: open.context,
        key: open.key,
        query: '',
        anchor: open.anchor,
        revert: open.revert
      });
      return;
    }

    if (context) {
      // The variant's listeners run the shortcut after this.
      setStrip({ ...open, context, key, fresh: false });
      schedule();
      return;
    }

    if (/^[0-9]$/.test(key) && offer()?.value?.direct) {
      consume(event);
      setStrip({
        mode: 'search',
        context: open.context,
        key: open.key,
        query: key,
        anchor: open.anchor,
        revert: open.revert
      });
      return;
    }

    if (isLetter(key) && !event.shiftKey) {
      consume(event);
      if (open.fresh && isLetter(open.key)) {
        // A word starting with a shortcut letter: what the letter did was not meant.
        open.revert();
        setStrip({ mode: 'search', query: open.key + key, anchor: open.anchor, revert: open.revert });
        return;
      }

      setStrip({ mode: 'search', query: key, anchor: anchor(), revert: remember() });
      return;
    }

    close();
  }

  /** The command line's rows for `query`, within the context of the key it started from. */
  function find(query: string): PaletteEntry[] {
    const context = options.context();
    const scope = offer();
    const trimmed = query.trim();
    if (!trimmed) {
      return scope ? offered() : [];
    }

    const amount = /^\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined;
    const value = amount === undefined ? undefined : scope?.value?.intent(amount);
    const found = searchPalette(trimmed, context);
    // The parser's reading of the whole line stays first; the rest of the context's groups come next.
    const understood = parseCommand(trimmed, context) !== undefined;
    const reading = understood ? found.slice(0, 1) : [];
    const rest = understood ? found.slice(1) : found;
    const inScope = (entry: PaletteEntry) => scope?.groups.includes(entry.group) ?? false;
    const rows = [
      ...(value ? [parsedEntry([value], context)] : []),
      ...reading,
      ...rest.filter(inScope),
      ...rest.filter((entry) => !inScope(entry))
    ];
    const seen = new Set<string>();
    return rows
      .filter((entry) => {
        const id = entry.intents.map(intentKey).join('|');
        if (seen.has(id)) {
          return false;
        }

        seen.add(id);
        return true;
      })
      .slice(0, resultCount);
  }

  function move(step: number) {
    const count = current()?.mode === 'search' ? results().length : offered().length;
    if (count === 0) {
      return;
    }

    const from = selected() < 0 && step < 0 ? 0 : selected();
    setSelected((((from + step) % count) + count) % count);
    schedule();
  }

  /**
   * Runs `row`. A repeatable command run from the offer keeps it open; anything else closes the strip, which then says
   * what the command did.
   */
  async function run(row: PaletteEntry) {
    const open = current();
    if (!open || open.mode === 'done' || running) {
      return;
    }

    const stays = open.mode === 'offer' && row.intents.every(repeatable);
    running = true;
    const outcomes = await options.run(row.intents).finally(() => {
      running = false;
    });
    options.onRan?.(row.intents, outcomes);
    if (stays) {
      schedule();
      return;
    }

    setStrip({ mode: 'done', outcome: summarize(outcomes), anchor: open.anchor });
    schedule();
  }

  function cancel() {
    const open = current();
    if (open && open.mode !== 'done') {
      open.revert();
    }

    close();
  }

  function close() {
    clearTimeout(timer);
    if (current()) {
      setStrip(undefined);
    }
  }

  /** Closes the offer after `offerMs` without a key, unless the pointer is over it, and a result after a moment. */
  function schedule() {
    clearTimeout(timer);
    const open = current();
    if (!open || hovered || open.mode === 'search') {
      return;
    }

    timer = setTimeout(close, open.mode === 'offer' ? offerMs : open.outcome.ok ? doneMs : failedMs);
  }

  /** Remembers what keys and commands may change, returning what puts it back. */
  function remember() {
    const tools = session.rememberTools();
    const view = session.camera.current();
    const variant = options.remember?.();
    return () => {
      void tools();
      if (session.camera.current() !== view) {
        session.camera.navigate(view);
      }

      variant?.();
    };
  }

  /** Where the strip shows: by the last pointer over the page, or at the bottom middle without one. */
  function anchor(): Anchor | undefined {
    return pointer && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= innerWidth && pointer.y <= innerHeight
      ? pointer
      : undefined;
  }
}

/** The type-ahead's API; see `createTypeAhead`. */
export type TypeAheadApi = ReturnType<typeof createTypeAhead>;

/** Where the strip was opened: the pointer's place in CSS pixels of the page, and its type. */
export type Anchor = { x: number; y: number; pointer: string };

/**
 * The open strip: the offer after a shortcut key, the command line, or what a command did. `context` is the key's,
 * `key` the key itself; `fresh` while it is the only key so far. `revert` takes back what changed since it opened.
 */
export type TypeAheadStrip =
  | OfferStrip
  | {
      mode: 'search';
      query: string;
      context?: KeyContextId;
      key?: string;
      anchor: Anchor | undefined;
      revert: () => void;
    }
  | { mode: 'done'; outcome: Outcome; anchor: Anchor | undefined };

type OfferStrip = {
  mode: 'offer';
  context: KeyContextId;
  key: string;
  fresh: boolean;
  anchor: Anchor | undefined;
  revert: () => void;
};

/** Keeps a key the type-ahead used from the page, the variant's shortcuts and the browser. */
function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * The lower-case key pressed. A letter or digit typed on a non-Latin layout (`и` on the B key) reads as the physical
 * key, as the shortcuts do, so that commands, which are English, can be typed too.
 */
export function typedKey(event: Pick<KeyboardEvent, 'key' | 'code'>) {
  const typed = event.key.toLowerCase();
  if (typed.length !== 1 || /[ -~]/.test(typed)) {
    return typed;
  }

  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3).toLowerCase();
  }

  return /^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : (physicalKeys[event.code] ?? typed);
}

function isLetter(key: string) {
  return /^[a-z]$/.test(key);
}

const physicalKeys: Record<string, string> = { BracketLeft: '[', BracketRight: ']', Space: ' ' };

/** Milliseconds the offer stays without a key while the pointer is elsewhere. */
const offerMs = 5000;
/** Milliseconds what a command did stays, and a failure. */
const doneMs = 1500;
const failedMs = 3200;
/** Rows the command line lists at most. */
const resultCount = 8;
