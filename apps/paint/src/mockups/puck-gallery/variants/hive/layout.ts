import { presets, tools, type Preset, type Setting, type ToolId } from '../../kit/catalog';
import { blendModes, type BlendMode, type LayerId, type Point } from '../../kit/createSketchCanvas';
import { fractionOf, type NumberSetting } from '../../kit/values';
import { clockAngle, hexagon, ringSlots, slot, slotDistance, SQRT3 } from './geometry';

/**
 * Where every cell of the Hive sits. The Puck, a large flat-top hexagon split into six wedges around a small core,
 * sits in the socket of seven grid slots at the origin (the pen). Around it, on one pointy-top grid: the tools as a
 * flower on the hand side, the view extras as small cells on the other side of the Puck, the layers as a staggered
 * column beyond them, the current tool's settings as a lozenge below with the brush presets under it, and above, on
 * a finer grid, the colour palette with its greys, recent colours and the current and previous colours.
 *
 * Coordinates are relative to the Puck's centre; `unit` is the width of a main cell (42 px at full size).
 */
export function hiveCells(input: {
  hand: 'left' | 'right';
  /** The current tool's settings; their slots stay put when the tool changes. */
  settings: readonly Setting[];
  /** Layer ids, top first. */
  layers: readonly LayerId[];
  unit: number;
}): HiveCell[] {
  const { unit } = input;
  const radius = unit / SQRT3;
  const side = input.hand === 'left' ? 1 : -1;
  const cells: HiveCell[] = [];
  const grid = (
    id: string,
    group: HiveGroup,
    u: number,
    r: number,
    act: HiveAct,
    options: { mirror?: boolean; scale?: number } = {}
  ) => {
    const at = slot(options.mirror ? u * side : u, r, unit);
    const scale = options.scale ?? 1;
    const shape = hexagon(at, radius * scale);
    cells.push({ id, group, at, shape, hit: scale < 1 ? hexagon(at, radius) : shape, size: unit * scale, act });
  };

  cells.push(...puckCells(radius));

  tools.forEach((tool, index) => {
    const [u, r] = toolSlots[index]!;
    grid(`tool:${tool.id}`, 'tools', u, r, { kind: 'tool', tool: tool.id, index }, { mirror: true });
  });

  viewSlots.forEach(([u, r, view]) => grid(`view:${view}`, 'view', u, r, { kind: 'view', view }, smallMirrored));

  input.layers.forEach((layer, index) => {
    const r = layerTop + index;
    const u = layerColumn(r);
    grid(`layer:${layer}`, 'layers', u, r, { kind: 'layer', layer }, { mirror: true });
    grid(`eye:${layer}`, 'layers', u + 2, r, { kind: 'eye', layer }, smallMirrored);
  });

  const addRow = layerTop + input.layers.length;
  grid('layer-add', 'layers', layerColumn(addRow), addRow, { kind: 'addLayer' }, { mirror: true });

  input.settings.slice(0, settingSlots.length).forEach((setting, index) => {
    const [u, r] = settingSlots[index]!;
    grid(`setting:${index}`, 'brush', u, r, { kind: 'setting', setting });
  });

  presets.forEach((preset, index) => {
    const [u, r] = presetSlots[index]!;
    // The second row is one slot longer on the side away from the hand; both rows read left to right.
    grid(`preset:${preset.id}`, 'brush', r === 6 && side < 0 ? u - 2 : u, r, { kind: 'preset', preset });
  });

  cells.push(...colorCells(unit));
  return cells;
}

/** The parts of the Hive, which share a tone and hide or dim together. */
export type HiveGroup = 'puck' | 'tools' | 'view' | 'color' | 'brush' | 'layers' | 'flyout';

/** One cell: its place, its exact outline (for drawing and hit tests) and what it does. */
export type HiveCell = {
  /** Stable across rebuilds, so that rendered cells keep their elements. */
  id: string;
  group: HiveGroup;
  /** The centre, relative to the Puck. */
  at: Point;
  /** The drawn outline, relative to the Puck. */
  shape: readonly Point[];
  /**
   * The outline that takes presses: the shape itself, or for a secondary cell drawn smaller than its slot (an eye,
   * a view extra) the whole slot, so that it stays a fair target.
   */
  hit: readonly Point[];
  /** The width the contents are laid out for, before the lens. */
  size: number;
  act: HiveAct;
};

/** What a cell does; the variant decides how a tap, a drag, the wheel or Enter applies it. */
export type HiveAct =
  | { kind: 'nav'; nav: 'pan' | 'zoom' | 'rotate' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'size' }
  | { kind: 'core' }
  | { kind: 'tool'; tool: ToolId; index: number }
  | { kind: 'view'; view: 'fit' | 'flip' | 'symmetry' }
  | { kind: 'palette'; ring: number; angle: number }
  | { kind: 'paletteCenter' }
  | { kind: 'grey'; level: number }
  | { kind: 'recent'; index: number }
  | { kind: 'current' }
  | { kind: 'previous' }
  | { kind: 'preset'; preset: Preset }
  | { kind: 'setting'; setting: Setting }
  | { kind: 'layer'; layer: LayerId }
  | { kind: 'eye'; layer: LayerId }
  | { kind: 'addLayer' }
  | { kind: 'value'; target: ValueTarget; value: number }
  | { kind: 'option'; setting: ChoiceSetting; option: string }
  | { kind: 'blend'; layer: LayerId; mode: BlendMode }
  | { kind: 'layerAction'; layer: LayerId; action: LayerAction }
  | { kind: 'back'; of: Flyout }
  | { kind: 'empty' };

/** A choice setting from the catalog. */
export type ChoiceSetting = Extract<Setting, { kind: 'choice' }>;

/** What a layer's flyout offers besides the layer itself. */
export type LayerAction = 'opacity' | 'blend' | 'lock' | 'up' | 'down' | 'duplicate' | 'delete';

/** A number a value cell or a flyout edits: a setting of the current tool, or a layer's opacity. */
export type ValueTarget = { kind: 'setting'; setting: NumberSetting } | { kind: 'opacity'; layer: LayerId };

/** The settings of a layer's opacity, as a number setting, so that it scrubs and steps like the others. */
export const opacitySetting: NumberSetting = {
  kind: 'number',
  key: 'layer-opacity',
  label: 'Layer opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]
};

/**
 * A cell's unfolded choices, laid out around `at` (relative to the Puck): a number's twelve stops as a clock, a
 * choice's options and a layer's actions as the six neighbours, blend modes in reading order over two rings. The
 * colour wheel has no cells: the variant shows the app's hue triangle there instead.
 */
export type Flyout =
  | { kind: 'number'; at: Point; target: ValueTarget }
  | { kind: 'choice'; at: Point; setting: ChoiceSetting }
  | { kind: 'layer'; at: Point; layer: LayerId }
  | { kind: 'blend'; at: Point; layer: LayerId }
  | { kind: 'wheel'; at: Point };

/**
 * The cells of an unfolded flyout around its `at`, mirrored for the hand where direction matters (a layer's
 * actions open away from the Puck). The middle cell is a `back` cell showing what unfolded; tapping it folds up.
 */
export function flyoutCells(flyout: Flyout, unit: number, hand: 'left' | 'right'): HiveCell[] {
  if (flyout.kind === 'wheel') {
    return [];
  }

  const radius = unit / SQRT3;
  const side = hand === 'left' ? 1 : -1;
  const cells: HiveCell[] = [];
  const place = (id: string, u: number, r: number, act: HiveAct) => {
    const offset = slot(u, r, unit);
    const at = { x: flyout.at.x + offset.x, y: flyout.at.y + offset.y };
    const shape = hexagon(at, radius);
    cells.push({ id: `flyout:${id}`, group: 'flyout', at, shape, hit: shape, size: unit, act });
  };

  /** Fills the slots of `rings` that nothing took with inert dark cells, so that the flyout is one whole comb. */
  const fill = (rings: number[]) => {
    for (const ring of rings) {
      for (const { u, r } of ringSlots(ring)) {
        const offset = slot(u, r, unit);
        const taken = cells.some(
          (cell) => Math.hypot(cell.at.x - flyout.at.x - offset.x, cell.at.y - flyout.at.y - offset.y) < 1
        );
        if (!taken) {
          place(`empty:${ring}:${u},${r}`, u, r, { kind: 'empty' });
        }
      }
    }
  };

  place('back', 0, 0, { kind: 'back', of: flyout });
  if (flyout.kind === 'number') {
    const setting = flyout.target.kind === 'setting' ? flyout.target.setting : opacitySetting;
    const clock = ringSlots(2);
    clockStops(setting).forEach((value, index) => {
      const { u, r } = clock[index]!;
      place(`value:${index}`, u, r, { kind: 'value', target: flyout.target, value });
    });
    fill([1, 2]);
  } else if (flyout.kind === 'choice') {
    flyout.setting.options.slice(0, neighbourOrder.length).forEach((option, index) => {
      const [u, r] = neighbourOrder[index]!;
      place(`option:${index}`, u, r, { kind: 'option', setting: flyout.setting, option });
    });
    fill([1]);
  } else if (flyout.kind === 'layer') {
    layerActionSlots.forEach(([u, r, action]) =>
      place(`layer:${action}`, u * side, r, { kind: 'layerAction', layer: flyout.layer, action })
    );
  } else {
    const slots = [...ringSlots(1), ...ringSlots(2)].sort((a, b) => a.r - b.r || a.u - b.u);
    blendModes.forEach((mode, index) => {
      const { u, r } = slots[index]!;
      place(`blend:${mode}`, u, r, { kind: 'blend', layer: flyout.layer, mode });
    });
    fill([1, 2]);
  }

  return cells;
}

/**
 * Up to twelve of a setting's presets, spread evenly over its range (geometrically for log settings), for a clock
 * of stops that never moves: the same value always sits at the same hour.
 */
export function clockStops(setting: NumberSetting): number[] {
  const all = [...setting.presets];
  if (all.length <= 12) {
    return all;
  }

  const taken = new Set<number>();
  return Array.from({ length: 12 }, (_, index) => {
    const target = index / 11;
    let best = -1;
    for (const [at, value] of all.entries()) {
      if (taken.has(at)) {
        continue;
      }

      const distance = Math.abs(fractionOf(setting, value) - target);
      if (best < 0 || distance < Math.abs(fractionOf(setting, all[best]!) - target)) {
        best = at;
      }
    }

    taken.add(best);
    return all[best]!;
  }).sort((a, b) => a - b);
}

/**
 * The Puck: a flat-top hexagon as wide as the socket of seven slots allows (its edges touch the next ring's corners),
 * split into six wedges around a small core. Wedges run clockwise from the lower right: Rotate, Size, Pan, Undo,
 * Zoom, Redo, so that Zoom and Size, which drag up and down, sit at the top and the bottom.
 */
function puckCells(radius: number): HiveCell[] {
  const apothem = radius * 2;
  const outer = hexagon({ x: 0, y: 0 }, (apothem * 2) / SQRT3, true);
  const inner = hexagon({ x: 0, y: 0 }, coreShare * ((apothem * 2) / SQRT3), true);
  const wedges: HiveAct[] = [
    { kind: 'nav', nav: 'rotate' },
    { kind: 'size' },
    { kind: 'nav', nav: 'pan' },
    { kind: 'undo' },
    { kind: 'nav', nav: 'zoom' },
    { kind: 'redo' }
  ];
  const size = apothem * (1 - coreShare);
  const cells = wedges.map((act, index): HiveCell => {
    const next = (index + 1) % 6;
    const angle = ((60 * index + 30) * Math.PI) / 180;
    const middle = apothem * (0.5 + coreShare / 2);
    return {
      id: `puck:${index}`,
      group: 'puck',
      at: { x: Math.cos(angle) * middle, y: Math.sin(angle) * middle },
      shape: [inner[index]!, outer[index]!, outer[next]!, inner[next]!],
      hit: [inner[index]!, outer[index]!, outer[next]!, inner[next]!],
      size,
      act
    };
  });
  cells.push({
    id: 'puck:core',
    group: 'puck',
    at: { x: 0, y: 0 },
    shape: inner,
    hit: inner,
    size: apothem * coreShare,
    act: { kind: 'core' }
  });
  return cells;
}

/** The core's share of the Puck's radius. */
const coreShare = 0.3;

/**
 * The colour group above the Puck, on a grid two thirds as fine: a hexagonal palette of three rings around a
 * middle cell (hue around, lightness toward the middle), the upper half of the fourth ring holding greys (left,
 * black to white) and recent colours (right), and the current and previous colours as two larger cells at the
 * palette's left and right corners.
 */
function colorCells(unit: number): HiveCell[] {
  const fine = unit * fineShare;
  const fineRadius = fine / SQRT3;
  const center = { x: 0, y: -paletteLift * unit };
  const cells: HiveCell[] = [];
  const place = (id: string, u: number, r: number, act: HiveAct) => {
    const offset = slot(u, r, fine);
    const at = { x: center.x + offset.x, y: center.y + offset.y };
    const shape = hexagon(at, fineRadius);
    cells.push({ id, group: 'color', at, shape, hit: shape, size: fine, act });
  };

  for (let r = -3; r <= 3; r++) {
    for (let u = -6; u <= 6; u++) {
      const ring = slotDistance(u, r);
      if ((u + r) % 2 !== 0 || ring > 3) {
        continue;
      }

      const offset = slot(u, r, fine);
      place(
        `palette:${u},${r}`,
        u,
        r,
        ring === 0 ? { kind: 'paletteCenter' } : { kind: 'palette', ring, angle: clockAngle(offset) }
      );
    }
  }

  const arc = ringSlots(4).filter(({ r }) => r < 0);
  const left = arc.filter(({ u }) => u <= 0).sort((a, b) => a.u - b.u);
  const right = arc.filter(({ u }) => u > 0).sort((a, b) => a.u - b.u);
  left.forEach(({ u, r }, index) => place(`grey:${index}`, u, r, { kind: 'grey', level: index / (left.length - 1) }));
  right.forEach(({ u, r }, index) => place(`recent:${index}`, u, r, { kind: 'recent', index }));

  const bigRadius = unit * 0.62;
  const reach = 6 * (fine / 2) + fine / 2 + 2 + (bigRadius * SQRT3) / 2;
  for (const [id, x, act] of [
    ['color:current', -reach, { kind: 'current' }],
    ['color:previous', reach, { kind: 'previous' }]
  ] as const) {
    const at = { x, y: center.y };
    const shape = hexagon(at, bigRadius);
    cells.push({ id, group: 'color', at, shape, hit: shape, size: bigRadius * SQRT3, act });
  }

  return cells;
}

/** The colour grid's cell width as a share of a main cell's. */
const fineShare = 2 / 3;

/** How far above the Puck the palette's middle sits, in main cell widths. */
export const paletteLift = 3.6;

/**
 * The tools' flower on the hand side, in doubled coordinates for the left hand: Brush in the middle, the other
 * painting tools on the side toward the Puck, the rest around, Gradient on top.
 */
const toolSlots: readonly (readonly [number, number])[] = [
  [-6, 0],
  [-5, -1],
  [-4, 0],
  [-5, 1],
  [-7, 1],
  [-8, 0],
  [-7, -1],
  [-6, -2]
];

/** The view extras hug the Puck on the side away from the hand. */
const viewSlots: readonly (readonly [number, number, 'fit' | 'flip' | 'symmetry'])[] = [
  [3, -1, 'fit'],
  [4, 0, 'flip'],
  [3, 1, 'symmetry']
];

const smallMirrored = { mirror: true, scale: 0.72 };

/** The row of the top layer; the column grows down. */
const layerTop = -3;

/** The layers' column zigzags between two slots, one empty column beyond the view extras. */
function layerColumn(row: number) {
  return Math.abs(row) % 2 === 1 ? 7 : 8;
}

/** The settings' lozenge below the Puck, 3 + 4 + 3 slots in reading order. */
const settingSlots: readonly (readonly [number, number])[] = [
  [-2, 2],
  [0, 2],
  [2, 2],
  [-3, 3],
  [-1, 3],
  [1, 3],
  [3, 3],
  [-2, 4],
  [0, 4],
  [2, 4]
];

/** The presets in two rows under the settings, for the left hand (the right hand shifts the second row left). */
const presetSlots: readonly (readonly [number, number])[] = [
  [-5, 5],
  [-3, 5],
  [-1, 5],
  [1, 5],
  [3, 5],
  [5, 5],
  [-4, 6],
  [-2, 6],
  [0, 6],
  [2, 6],
  [4, 6],
  [6, 6]
];

/** A choice's options among the six neighbours, in reading order. */
const neighbourOrder: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-2, 0],
  [2, 0],
  [-1, 1],
  [1, 1]
];

/**
 * A layer's actions around it for the left hand (mirrored for the right): moving up and down and the lock on the
 * outer side, opacity, blend and duplicate toward the Puck, and delete set apart below.
 */
const layerActionSlots: readonly (readonly [number, number, LayerAction])[] = [
  [-1, -1, 'opacity'],
  [1, -1, 'up'],
  [-2, 0, 'blend'],
  [2, 0, 'lock'],
  [-1, 1, 'duplicate'],
  [1, 1, 'down'],
  [2, 2, 'delete']
];
