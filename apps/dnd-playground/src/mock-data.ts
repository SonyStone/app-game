/**
 * MARK: Types & Mock Data
 *
 * Defines the block types and provides mock data for solid-nest v0.6.x.
 * All blocks use a single recursive union type so createBlockTree works.
 */

// ============================================================================
// MARK: Block Types
// ============================================================================

export type GroupBlock = {
  key: string;
  type: 'group';
  name: string;
  children: MyBlock[];
};

export type BrushBlock = {
  key: string;
  type: 'brush';
  name: string;
  diameter: number;
  spacing: number;
  brushType: 'sampled' | 'computed';
  hue: number;
};

/** Union of all block types (including root) */
export type MyBlock = GroupBlock | BrushBlock;

// ============================================================================
// MARK: Type Guards
// ============================================================================

export function isGroup(b: MyBlock): b is GroupBlock {
  return b.type === 'group';
}

export function isBrush(b: MyBlock): b is BrushBlock {
  return b.type === 'brush';
}

// ============================================================================
// MARK: Constructors
// ============================================================================

let _id = 0;
function uid(prefix: string): string {
  return `${prefix}_${++_id}`;
}

function brush(name: string, opts?: Partial<BrushBlock>): BrushBlock {
  return {
    key: uid('brush'),
    type: 'brush',
    name,
    diameter: opts?.diameter ?? Math.round(Math.random() * 200 + 5),
    spacing: opts?.spacing ?? Math.round(Math.random() * 40 + 5),
    brushType: opts?.brushType ?? (Math.random() > 0.4 ? 'sampled' : 'computed'),
    hue: opts?.hue ?? Math.round(Math.random() * 360)
  };
}

function group(name: string, children: MyBlock[]): GroupBlock {
  return {
    key: uid('group'),
    type: 'group',
    name,
    children
  };
}

// ============================================================================
// MARK: Mock Data — root is a GroupBlock acting as container
// ============================================================================

export function createMockData(): GroupBlock {
  return group('Root', [
    group('Basic_Brushes.abr', [
      group('Drawing Tools', [
        brush('Hard Round', { diameter: 19, spacing: 10, brushType: 'computed', hue: 210 }),
        brush('Soft Round', { diameter: 45, spacing: 25, brushType: 'computed', hue: 210 }),
        brush('Flat Blunt', { diameter: 30, spacing: 15, brushType: 'computed', hue: 210 })
      ]),
      group('Texture Brushes', [
        brush('Chalk', { diameter: 60, spacing: 30, brushType: 'sampled', hue: 40 }),
        brush('Charcoal', { diameter: 55, spacing: 35, brushType: 'sampled', hue: 35 }),
        brush('Pastel', { diameter: 40, spacing: 20, brushType: 'sampled', hue: 50 }),
        brush('Crayon', { diameter: 35, spacing: 25, brushType: 'sampled', hue: 45 })
      ]),
      brush('Eraser Tool', { diameter: 13, spacing: 25, brushType: 'computed', hue: 0 }),
      brush('Mixer Brush', { diameter: 206, spacing: 3, brushType: 'sampled', hue: 280 })
    ]),
    group('Artistic_Set.abr', [
      group('Watercolor', [
        brush('Wet Wash', { diameter: 80, spacing: 20, brushType: 'sampled', hue: 190 }),
        brush('Dry Wash', { diameter: 70, spacing: 25, brushType: 'sampled', hue: 180 }),
        brush('Splatter', { diameter: 120, spacing: 40, brushType: 'sampled', hue: 200 })
      ]),
      group('Oil Paint', [
        brush('Flat Bristle', { diameter: 50, spacing: 15, brushType: 'sampled', hue: 120 }),
        brush('Round Bristle', { diameter: 40, spacing: 12, brushType: 'sampled', hue: 130 }),
        brush('Fan Brush', { diameter: 65, spacing: 20, brushType: 'sampled', hue: 110 }),
        brush('Palette Knife', { diameter: 35, spacing: 8, brushType: 'sampled', hue: 100 })
      ]),
      brush('Smudge Tool', { diameter: 13, spacing: 25, brushType: 'computed', hue: 270 })
    ]),
    group('FX_Brushes.abr', [
      brush('Smoke', { diameter: 150, spacing: 50, brushType: 'sampled', hue: 0 }),
      brush('Fire', { diameter: 100, spacing: 35, brushType: 'sampled', hue: 15 }),
      brush('Sparks', { diameter: 80, spacing: 60, brushType: 'sampled', hue: 45 }),
      brush('Lightning', { diameter: 200, spacing: 70, brushType: 'sampled', hue: 55 }),
      brush('Bokeh', { diameter: 90, spacing: 45, brushType: 'sampled', hue: 300 })
    ])
  ]);
}

// ============================================================================
// MARK: Counting Helpers
// ============================================================================

export function countBrushes(root: MyBlock): number {
  if (root.type === 'brush') return 1;
  return root.children.reduce((sum, c) => sum + countBrushes(c), 0);
}

export function countGroups(root: GroupBlock): number {
  return root.children.filter((c) => c.type === 'group').length;
}
