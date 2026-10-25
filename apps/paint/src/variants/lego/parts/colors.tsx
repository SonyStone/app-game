import { createMemo, merge } from 'solid-js';
import {
  autoWheelLook,
  HarmonyPart,
  HexPart,
  HistoryPart,
  MaskPart,
  PairPart,
  PalettePart,
  SwatchPart,
  wheelLooks,
  WheelPart
} from '../colorParts';
import type { LegoServices } from '../LegoServices';
import { definePart, type PartBinding } from './definition';

/** Static color definitions. The views receive controlled colors/settings and guarded commands only. */
export const colorParts = [
  definePart({
    kind: 'color:swatch',
    family: 'color',
    section: 'Color',
    label: 'Swatch',
    needs: (s, f) => ({
      get color() {
        return s.color.value();
      },
      get span() {
        return f.span;
      },
      onOpen: f.onOpen
    }),
    View: SwatchPart
  }),
  definePart({
    kind: 'color:wheel',
    family: 'color',
    section: 'Color',
    label: 'Picker',
    looks: { looks: wheelLooks, auto: autoWheelLook },
    needs: (s, f) =>
      merge(colorInput(s, f), {
        get span() {
          return f.span;
        },
        get look() {
          return f.look;
        },
        oklch: {
          wheel: s.color.oklch.wheel,
          settings: s.color.oklch.settings,
          edit: f.command(s.color.oklch.edit),
          settle: f.command(s.color.oklch.settle),
          update: f.command(s.color.oklch.update)
        },
        coolorus: { settings: s.color.coolorus.settings, update: f.command(s.color.coolorus.update) }
      }),
    View: WheelPart
  }),
  definePart({
    kind: 'color:pair',
    family: 'color',
    section: 'Color',
    label: 'Fore/back',
    needs: (s, f) => {
      const colors = createMemo(() => ({ foreground: s.color.value(), background: s.color.background() }));
      return {
        get colors() {
          return colors();
        },
        get span() {
          return f.span;
        },
        swap: f.command(s.color.swap)
      };
    },
    View: PairPart
  }),
  definePart({ kind: 'color:hex', family: 'color', section: 'Color', label: 'Hex', needs: colorInput, View: HexPart }),
  definePart({
    kind: 'color:history',
    family: 'color',
    section: 'Color',
    label: 'History',
    needs: (s, f) =>
      merge(colorInput(s, f), {
        get span() {
          return f.span;
        },
        get colors() {
          return s.color.recent.colors();
        }
      }),
    View: HistoryPart
  }),
  definePart({
    kind: 'color:palette',
    family: 'color',
    section: 'Color',
    label: 'Palette',
    needs: (s, f) =>
      merge(colorInput(s, f), {
        get span() {
          return f.span;
        }
      }),
    View: PalettePart
  }),
  definePart({
    kind: 'color:harmony',
    family: 'color',
    section: 'Color',
    label: 'Harmony',
    needs: guides,
    View: HarmonyPart
  }),
  definePart({
    kind: 'color:mask',
    family: 'color',
    section: 'Color',
    label: 'Gamut mask',
    needs: guides,
    View: MaskPart
  })
];

function colorInput(s: LegoServices, f: PartBinding) {
  return {
    get color() {
      return s.color.value();
    },
    onInput: f.command(s.color.set),
    onCommit: f.command(s.color.recent.remember)
  };
}

function guides(s: LegoServices, f: PartBinding) {
  return {
    get span() {
      return f.span;
    },
    get settings() {
      return s.color.oklch.settings();
    },
    onSettings: f.command(s.color.oklch.update)
  };
}
