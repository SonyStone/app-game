import { createSignal } from 'solid-js';

/**
 * The mockup's experimental options, edited in the debug sidebar and kept in `localStorage` so that they survive
 * reloads on the tablet. Must be created within a Solid owner.
 */
export function createDebugOptions() {
  const [options, setOptions] = createSignal<DebugOptions>(load());

  return {
    options,
    /** Sets one option and stores all of them. */
    set<K extends keyof DebugOptions>(key: K, value: DebugOptions[K]) {
      const next = { ...options(), [key]: value };
      setOptions(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
    },
    /** Restores every option's default. */
    reset() {
      setOptions(defaultOptions);
      localStorage.removeItem(storageKey);
    }
  };
}

/**
 * Every option's default. The shortcut button and the ring follow NavigationPuckAddon
 * (github.com/SonyStone/NavigationPuckAddon) where the spec (`apps/paint/docs/tile-cluster.md`) does not differ.
 */
export const defaultOptions = {
  /**
   * The hand that holds the pen. It sets the tools' side of the Puck, the side of the pen where touches count as the
   * palm, and the shortcut button's corner below the pen (mirrored for the right hand).
   */
  hand: 'left' as 'left' | 'right',
  /** Shows every debug drawing: the palm zone and ignored touches, the shortcut button's reach. */
  showDebug: false,
  /** Space opens the cluster while held, or toggles it with each press. */
  hotkeyMode: 'hold' as 'hold' | 'toggle',
  /** A continuous action hides the cluster and the Puck, except the popup in use. */
  hideDuringActions: true,
  /** What lies under the pointer when a held cluster shows again after an action: the Puck's center or its control. */
  reshowAnchor: 'center' as 'center' | 'same',
  /** The Puck ring's dead circle radius, CSS pixels. */
  ringDead: 30,
  /** The Puck ring's width outside the dead circle, CSS pixels. */
  ringWidth: 36,
  /** Swap the columns when the hand's sides do not fit at the window's edge. */
  autoSwap: true,
  palmRejection: true,
  /**
   * CSS pixels from the pen's x to the palm side's edge: positive values reach past the pen toward the free hand,
   * negative ones stop short of it.
   */
  palmTolerance: -100,
  /** Milliseconds after the pen's last event (or at once when it leaves) during which the palm's side is guarded. */
  palmLinger: 200,
  /**
   * How the shortcut button lets the pointer reach it: accumulated intent (moves toward it build it up, others wear
   * it down; the button only moves while invisible), a safe triangle (aim guard), or the addon's follow zone.
   */
  launcherPlacement: 'intent' as 'intent' | 'aim' | 'zone',
  /** Intent: CSS pixels of travel aimed within the button that build full intent. */
  launcherRise: 30,
  /** Intent: CSS pixels of travel square to the button's direction, or away, that wear full intent down. */
  launcherFall: 60,
  /** CSS pixels the safe triangle's base reaches past the button on each side. */
  launcherAimTolerance: 16,
  /** CSS pixels from the pointer to the shortcut button's center along each axis of its corner. */
  launcherDistance: 80,
  launcherSize: 45,
  /** How much smaller the fade start circle is than the follow zone, in percent of the zone. */
  launcherFadeInset: 40,
  /** The shortcut button's opacity while the pointer is outside its reach. */
  launcherIdleOpacity: 0
};

export type DebugOptions = typeof defaultOptions;

/**
 * The sidebar's controls in its three parts: settings that go into Paint, debugging aids, and experiments grouped by
 * the question each one answers.
 */
export const optionParts: readonly {
  title: string;
  groups: readonly { question?: string; options: readonly OptionControl[] }[];
}[] = [
  { title: 'Settings', groups: [{ options: [{ key: 'hand', label: 'Pen hand', choices: ['left', 'right'] }] }] },
  { title: 'Debug', groups: [{ options: [{ key: 'showDebug', label: 'Show debug drawing' }] }] },
  {
    title: 'Experiments',
    groups: [
      {
        question: 'How does the shortcut button catch intent?',
        options: [
          { key: 'launcherPlacement', label: 'Reach', choices: ['intent', 'aim', 'zone'] },
          { key: 'launcherRise', label: 'Intent: build up over, px', min: 5, max: 120, step: 5 },
          { key: 'launcherFall', label: 'Intent: wear down over, px', min: 5, max: 200, step: 5 },
          { key: 'launcherAimTolerance', label: 'Aim tolerance, px', min: 0, max: 80, step: 2 },
          { key: 'launcherFadeInset', label: 'Zone: fade-start inset, %', min: 0, max: 80, step: 5 },
          { key: 'launcherIdleOpacity', label: 'Idle opacity', min: 0, max: 1, step: 0.05 },
          { key: 'launcherSize', label: 'Size, px', min: 18, max: 96, step: 1 },
          { key: 'launcherDistance', label: 'Cursor distance, px', min: 24, max: 240, step: 4 }
        ]
      },
      {
        question: 'Hotkey: hold or toggle?',
        options: [{ key: 'hotkeyMode', label: 'Space', choices: ['hold', 'toggle'] }]
      },
      {
        question: 'What shows during an action?',
        options: [{ key: 'hideDuringActions', label: 'Hide during continuous actions' }]
      },
      {
        question: 'What is under the pen after an action?',
        options: [{ key: 'reshowAnchor', label: 'Held cluster shows again with', choices: ['center', 'same'] }]
      },
      {
        question: 'What should the ring be like?',
        options: [
          { key: 'ringDead', label: 'Dead circle radius, px', min: 10, max: 80, step: 2 },
          { key: 'ringWidth', label: 'Ring width, px', min: 24, max: 120, step: 2 }
        ]
      },
      {
        question: 'What is the palm zone?',
        options: [
          { key: 'palmRejection', label: 'Enabled' },
          { key: 'palmTolerance', label: 'Past the pen, px', min: -200, max: 200, step: 5 },
          { key: 'palmLinger', label: 'Pen counts as near for, ms', min: 0, max: 3000, step: 50 }
        ]
      },
      {
        question: 'What happens at the window edges?',
        options: [{ key: 'autoSwap', label: 'Swap sides at edges' }]
      }
    ]
  }
];

/** One sidebar control: a choice among `choices`, a number within `min`–`max`, or otherwise a toggle. */
export type OptionControl =
  | { key: keyof DebugOptions; label: string; choices: readonly string[] }
  | { key: keyof DebugOptions; label: string; min: number; max: number; step: number }
  | { key: keyof DebugOptions; label: string };

/** Versioned, so that changed defaults replace options stored by earlier versions of the mockup. */
const storageKey = 'paint-mockup-tile-cluster-options-v6';

/** The stored options over the defaults, so that options added later get their defaults. */
function load(): DebugOptions {
  try {
    return { ...defaultOptions, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') } as DebugOptions;
  } catch {
    return defaultOptions;
  }
}
