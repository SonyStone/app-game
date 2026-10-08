import { createSignal } from 'solid-js';
import type { SketchIconName } from '../../shared/ui/SketchIcon';

/**
 * The functions a sector of the Puck ring can hold. `continuous` ones run while the press continues and hide the
 * cluster meanwhile; `instant` ones run once each time the press arrives on them. `tools` lists the only tools a
 * function works with; for other tools its sector is left empty.
 */
export const ringActions = {
  zoom: { label: 'Zoom', icon: 'zoom', kind: 'continuous' },
  pan: { label: 'Pan', icon: 'pan', kind: 'continuous' },
  roll: { label: 'Rotate', icon: 'rotate', kind: 'continuous' },
  brushSize: { label: 'Brush size', icon: 'brush', kind: 'continuous', tools: ['brush', 'mixer', 'eraser'] },
  undo: { label: 'Undo', icon: 'undo', kind: 'instant' },
  redo: { label: 'Redo', icon: 'redo', kind: 'instant' },
  clear: { label: 'Clear', icon: 'erase', kind: 'instant', tools: ['brush', 'mixer'] },
  fit: { label: 'Fit', icon: 'fullscreen', kind: 'instant' },
  flip: { label: 'Mirror', icon: 'mirror', kind: 'instant' }
} as const satisfies Record<
  string,
  { label: string; icon: SketchIconName; kind: 'continuous' | 'instant'; tools?: readonly string[] }
>;

/** Whether `action` works with `tool`, so that its sector shows. */
export function supports(action: RingAction, tool: string) {
  const entry = ringActions[action];
  return !('tools' in entry) || (entry.tools as readonly string[]).includes(tool);
}

export type RingAction = keyof typeof ringActions;

/**
 * The ring's sectors in clockwise order from `start`, a screen angle in degrees (clockwise from the right), each with
 * its angular span; the spans add up to 360°.
 */
export type RingLayout = { start: number; sectors: readonly { action: RingAction; span: number }[] };

/** Zoom upper left, a wide Undo and a narrow Redo upper right, Rotate lower right, Pan lower left. */
export const defaultRingLayout: RingLayout = {
  start: -180,
  sectors: [
    { action: 'zoom', span: 90 },
    { action: 'undo', span: 60 },
    { action: 'redo', span: 30 },
    { action: 'roll', span: 90 },
    { action: 'pan', span: 90 }
  ]
};

/** Narrowest sector the editor allows, in degrees. */
export const minSpan = 12;

/**
 * The ring layout, kept in `localStorage` so that edits survive reloads. Must be created within a Solid owner.
 */
export function createRingLayout() {
  const [layout, setStored] = createSignal<RingLayout>(load());
  const set = (next: RingLayout) => {
    setStored(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  return {
    layout,
    set,
    reset: () => set(defaultRingLayout)
  };
}

/** Each sector's absolute angles, `from` < `to`, starting at `layout.start`. */
export function sectorAngles(layout: RingLayout) {
  let from = layout.start;
  return layout.sectors.map((sector, index) => {
    const entry = { index, action: sector.action, from, to: from + sector.span };
    from += sector.span;
    return entry;
  });
}

/** The index of the sector at a screen angle in degrees. */
export function sectorIndexAt(layout: RingLayout, angle: number) {
  return sectorAngles(layout).find((sector) => within(angle, sector.from, sector.to))?.index ?? 0;
}

/** Whether a screen angle lies in a sector of `layout`, widened by `margin` degrees on each side. */
export function inSectorIndex(layout: RingLayout, index: number, angle: number, margin: number) {
  const sector = sectorAngles(layout)[index];
  return !!sector && within(angle, sector.from - margin, sector.to + margin);
}

/** Moves the boundary before sector `boundary` (0 is the one between the last sector and the first) to `angle`. */
export function moveBoundary(layout: RingLayout, boundary: number, angle: number): RingLayout {
  const count = layout.sectors.length;
  if (count < 2) {
    return layout;
  }

  const angles = sectorAngles(layout);
  const before = (boundary - 1 + count) % count;
  const current = angles[boundary]!.from;
  // The shortest turn from the boundary's angle to the pointer's.
  const delta = wrap(angle - current);
  const grow = Math.max(
    -(layout.sectors[before]!.span - minSpan),
    Math.min(layout.sectors[boundary]!.span - minSpan, delta)
  );
  const sectors = layout.sectors.map((sector, index) =>
    index === before
      ? { ...sector, span: sector.span + grow }
      : index === boundary
        ? { ...sector, span: sector.span - grow }
        : sector
  );
  return { start: boundary === 0 ? layout.start + grow : layout.start, sectors };
}

/** Puts `action` into the ring at `angle`, splitting the sector there in two halves. */
export function insertAction(layout: RingLayout, action: RingAction, angle: number): RingLayout {
  const index = sectorIndexAt(layout, angle);
  const target = sectorAngles(layout)[index]!;
  const half = layout.sectors[index]!.span / 2;
  if (half < minSpan) {
    return layout;
  }

  const sectors = [...layout.sectors];
  const after = within(angle, target.from + half, target.to);
  sectors.splice(
    index,
    1,
    ...(after
      ? [
          { action: target.action, span: half },
          { action, span: half }
        ]
      : [
          { action, span: half },
          { action: target.action, span: half }
        ])
  );
  return { ...layout, sectors };
}

/** Swaps the functions of two sectors, keeping their spans. */
export function swapActions(layout: RingLayout, from: number, to: number): RingLayout {
  const sectors = layout.sectors.map((sector, index) =>
    index === from
      ? { ...sector, action: layout.sectors[to]!.action }
      : index === to
        ? { ...sector, action: layout.sectors[from]!.action }
        : sector
  );
  return { ...layout, sectors };
}

/** Takes sector `index` out of the ring; the sector before it (or after, for the first) takes its span. */
export function removeSector(layout: RingLayout, index: number): RingLayout {
  if (layout.sectors.length < 2) {
    return layout;
  }

  const span = layout.sectors[index]!.span;
  const sectors = layout.sectors.filter((_, at) => at !== index);
  if (index === 0) {
    sectors[0] = { ...sectors[0]!, span: sectors[0]!.span + span };
    return { start: layout.start, sectors };
  }

  sectors[index - 1] = { ...sectors[index - 1]!, span: sectors[index - 1]!.span + span };
  return { ...layout, sectors };
}

/** An angle in degrees within [-180, 180). */
export function wrap(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

/** Whether `angle` lies in [from, to) on the circle. */
function within(angle: number, from: number, to: number) {
  return [angle - 720, angle - 360, angle, angle + 360, angle + 720].some(
    (candidate) => candidate >= from && candidate < to
  );
}

const storageKey = 'paint-mockup-ring-layout-v1';

function load(): RingLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as RingLayout | null;
    // Earlier versions called Clear "eraser".
    stored?.sectors.forEach((sector) => {
      if ((sector.action as string) === 'eraser') {
        (sector as { action: RingAction }).action = 'clear';
      }
    });
    const valid =
      stored &&
      Array.isArray(stored.sectors) &&
      stored.sectors.every((sector) => sector.action in ringActions && sector.span >= minSpan) &&
      Math.abs(stored.sectors.reduce((sum, sector) => sum + sector.span, 0) - 360) < 0.5;
    return valid ? stored : defaultRingLayout;
  } catch {
    return defaultRingLayout;
  }
}
