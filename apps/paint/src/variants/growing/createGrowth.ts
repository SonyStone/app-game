import { createEffect, createMemo, createSignal, untrack } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import {
  counted,
  emptyUsage,
  features,
  grownFeatures,
  parseUsage,
  pendingHint,
  requested,
  type Counter,
  type Feature
} from './growth';

/**
 * The Growing variant's state of growth, kept in `localStorage` between visits: the usage counters, which arrival
 * hints were dismissed, the "Show everything" switch and the drawing hand. `has` tells whether a control is shown:
 * grown by the rules in `growth.ts`, or everything while the switch is on. `hint` is the arrival to introduce next.
 * Storage failures keep the state for this visit. Must be created within a Solid owner.
 */
export function createGrowth() {
  const stored = read();
  // Several counts can land in one event, such as a stroke that also changes the color; each builds on the last.
  const [usage, setUsage, currentUsage] = createImmediateSignal(stored.usage);
  const [introduced, setIntroduced, currentIntroduced] = createImmediateSignal<ReadonlySet<Feature | 'welcome'>>(
    new Set(stored.introduced)
  );
  const [showEverything, setShowEverything] = createSignal(stored.showEverything);
  const [hand, setHand] = createSignal(stored.hand);
  const grown = createMemo(() => grownFeatures(usage()));
  const hint = createMemo(() => pendingHint(grown(), introduced(), showEverything()));

  createEffect(
    () => ({ usage: usage(), introduced: [...introduced()], showEverything: showEverything(), hand: hand() }),
    (state) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // Keep growing for this visit.
      }
    }
  );

  return {
    usage,
    grown,
    /** Whether a control is shown: grown, or everything is shown. */
    has: (feature: Feature) => showEverything() || grown().has(feature),
    /** The controls not grown yet, in dock order, for asking for them. */
    locked: () => features.filter((feature) => !grown().has(feature)),
    /** The arrival to introduce next, if any. */
    hint,
    showEverything,
    setShowEverything,
    /** The hand that holds the pen; the dock goes to the other side. */
    hand,
    setHand,
    /** Counts one more use of `counter`. */
    count(counter: Counter, by = 1) {
      setUsage(counted(untrack(currentUsage), counter, by));
    },
    /** Grows `wanted` at once, as a pressed shortcut or a request in the menu does. */
    request(wanted: readonly Feature[]) {
      const current = untrack(currentUsage);
      const next = requested(current, wanted);
      if (next !== current) {
        setUsage(next);
      }
    },
    /** Dismisses the arrival card of `id`; it is not shown again until the growth starts fresh. */
    dismiss(id: Feature | 'welcome') {
      const current = untrack(currentIntroduced);
      if (!current.has(id)) {
        setIntroduced(new Set([...current, id]));
      }
    },
    /** Hides every grown control again and forgets the counts and the dismissed hints; the drawing hand stays. */
    startFresh() {
      setUsage(emptyUsage);
      setIntroduced(new Set());
      setShowEverything(false);
    }
  };
}

/** The growth state; see `createGrowth`. */
export type Growth = ReturnType<typeof createGrowth>;

/** The stored state, or a fresh start when there is none or it cannot be read. */
function read() {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    stored = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Start fresh.
  }

  const introduced = Array.isArray(stored.introduced) ? stored.introduced : [];
  return {
    usage: parseUsage(stored.usage),
    introduced: [...features, 'welcome' as const].filter((id) => introduced.includes(id)),
    showEverything: stored.showEverything === true,
    // The user this was made for draws with the left hand.
    hand: stored.hand === 'right' ? ('right' as const) : ('left' as const)
  };
}

const storageKey = 'paint.growing';
