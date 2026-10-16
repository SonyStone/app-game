import type { SelectionTool } from '../selection';
import type { PaintSession } from '../session';
import { parsedEntry, type PaletteContext, type PaletteEntry } from './catalog';
import { swatchColors } from './colorNames';
import type { Intent } from './commands';

/** What a single-key shortcut is about, so that the type-ahead offers what goes with it. */
export type KeyContextId = 'brush' | 'eraser' | 'size' | 'selection' | 'fill' | 'colors' | 'view';

/** The session's single-key shortcuts (see `createPaintShortcuts`) by the lower-case key they match. */
export const sessionKeys: Readonly<Record<string, KeyContextId>> = {
  b: 'brush',
  e: 'eraser',
  l: 'selection',
  w: 'selection',
  g: 'fill',
  x: 'colors',
  d: 'colors',
  '[': 'size',
  ']': 'size'
};

/** What the type-ahead shows after a shortcut key; see `keyContext`. */
export type KeyContext = {
  id: KeyContextId;
  /** What is in use now, after the key: `Brush · Soft round · 24 px`. */
  title: string;
  /** Commands that go with the key, by section; empty sections are left out. */
  sections: OfferSection[];
  /**
   * What a number typed after the key sets, with its unit; with `direct`, digits typed right after the key set it,
   * otherwise only after a space.
   */
  value?: { intent: (amount: number) => Intent | undefined; unit: string; direct: boolean };
  /** Palette groups whose commands a search after the key lists first. */
  groups: readonly string[];
  /** What the command line after the key asks for, as its placeholder. */
  prompt: string;
};

/** A section of offered commands: rows of text, small chips, or color swatches. */
export type OfferSection = { title?: string; look: 'chips' | 'swatches'; entries: PaletteEntry[] };

/**
 * What goes with the shortcut key of context `id`, from the session's state now: the brush keys offer smaller and
 * bigger, sizes, the recent brushes and colors; the selection keys the selection tools and commands; the color keys
 * the colors; the view keys zoom, rotation and mirroring. Swatches start with the color in use, then the recent
 * `colors`, newest first.
 */
export function keyContext(
  id: KeyContextId,
  session: PaintSession,
  context: PaletteContext,
  colors: readonly string[]
): KeyContext {
  const entry = (intent: Intent, extra: Partial<PaletteEntry> = {}): PaletteEntry => ({
    ...parsedEntry([intent], context),
    ...extra
  });
  const sizes: OfferSection = {
    look: 'chips',
    entries: [
      entry({ type: 'scale-size', factor: 0.8 }, { title: 'Smaller', shortcut: '[' }),
      entry({ type: 'scale-size', factor: 1.25 }, { title: 'Bigger', shortcut: ']' }),
      ...sizeSteps.map((px) =>
        entry({ type: 'size', px }, { title: String(px), current: Math.round(session.brush().size) === px })
      )
    ]
  };
  const swatches: OfferSection = {
    title: 'Color',
    look: 'swatches',
    entries: [...new Set([session.brush().color, ...colors, ...swatchColors.map((color) => color.hex)])]
      .slice(0, swatchCount)
      .map((hex) => {
        const named = swatchColors.find((color) => color.hex === hex);
        return entry(
          { type: 'color', hex, name: named?.name ?? hex },
          { swatch: hex, current: hex === session.brush().color }
        );
      })
  };
  const size = { intent: (px: number) => (px > 0 ? sizeIntent(px) : undefined), unit: 'px', direct: true };

  switch (id) {
    case 'brush': {
      const brushes = [session.tools.preset(), ...session.recentPresets.recent(brushCount - 1)].flatMap((preset) => {
        const found = session.library.find(preset);
        return found
          ? [
              entry(
                { type: 'preset', id: found.id, name: found.name },
                { current: found.id === session.tools.preset() }
              )
            ]
          : [];
      });
      return {
        id,
        title: brushTitle(session, 'Brush'),
        sections: [sizes, { title: 'Brush', look: 'chips', entries: brushes }, swatches],
        value: size,
        groups: ['Brush', 'Color'],
        prompt: 'Size, brush or color'
      };
    }
    case 'eraser':
      return {
        id,
        title: brushTitle(session, 'Eraser'),
        sections: [sizes, { look: 'chips', entries: [entry({ type: 'tool', tool: 'brush' }, { shortcut: 'B' })] }],
        value: size,
        groups: ['Brush'],
        prompt: 'Size'
      };
    case 'size':
      return {
        id,
        title: brushTitle(session, session.tool() === 'eraser' ? 'Eraser' : 'Brush'),
        sections: [sizes],
        value: size,
        groups: ['Brush'],
        prompt: 'Size'
      };
    case 'selection': {
      const selected = session.selection.selected();
      const current = session.tool() === 'lasso' ? session.selection.tool() : undefined;
      return {
        id,
        title: current ? describeSelectionTool(current, context) : 'Selection',
        sections: [
          {
            look: 'chips',
            entries: selectionTools.map((tool) =>
              entry(
                { type: 'selection-tool', tool },
                { title: selectionToolTitles[tool], current: tool === current, shortcut: selectionKeys[tool] }
              )
            )
          },
          {
            look: 'chips',
            entries: [
              entry({ type: 'selection', action: 'all' }),
              ...(selected
                ? [
                    entry({ type: 'selection', action: 'none' }),
                    entry({ type: 'selection', action: 'invert' }),
                    entry({ type: 'transform' }),
                    entry({ type: 'selection', action: 'new-layer' })
                  ]
                : [])
            ]
          }
        ],
        value: {
          intent: (px) => (px > 0 ? { type: 'feather', px: Math.min(250, Math.round(px)) } : undefined),
          unit: 'px feather',
          direct: false
        },
        groups: ['Selection', 'Tool'],
        prompt: 'Feather or a selection command'
      };
    }
    case 'fill':
      return {
        id,
        title: session.selection.selected() ? 'Fill' : 'Fill · select an area first',
        sections: [
          {
            look: 'chips',
            entries: session.selection.selected()
              ? [entry({ type: 'selection', action: 'fill' }), entry({ type: 'tool', tool: 'gradient' })]
              : [entry({ type: 'selection', action: 'all' }), entry({ type: 'selection-tool', tool: 'lasso' })]
          },
          swatches
        ],
        groups: ['Color', 'Selection'],
        prompt: 'A color: red, #ff8800'
      };
    case 'colors':
      return {
        id,
        title: 'Colors',
        sections: [
          {
            look: 'chips',
            entries: [
              entry({ type: 'colors', action: 'swap' }, { shortcut: 'X' }),
              entry({ type: 'colors', action: 'reset' }, { shortcut: 'D' }),
              entry({ type: 'colors', action: 'pick' }),
              entry({ type: 'window', window: 'palette' }, { current: session.windows.isOpen('palette') })
            ]
          },
          swatches
        ],
        groups: ['Color'],
        prompt: 'A color: red, #ff8800'
      };
    case 'view': {
      const view = session.camera.camera();
      const degrees = Math.round((view.angle * 180) / Math.PI);
      return {
        id,
        title: `Zoom ${Math.round(view.zoom * 100)}%${degrees ? ` · ${degrees}°` : ''}${view.mirrored ? ' · mirrored' : ''}`,
        sections: [
          {
            look: 'chips',
            entries: [
              entry({ type: 'zoom-by', factor: 0.8 }),
              entry({ type: 'zoom-by', factor: 1.25 }),
              entry({ type: 'zoom', percent: 100 }, { title: '100%' }),
              entry({ type: 'view', action: 'reset' })
            ]
          },
          {
            look: 'chips',
            entries: [
              entry({ type: 'rotate', degrees: -15, relative: true }, { title: 'Rotate left' }),
              entry({ type: 'rotate', degrees: 15, relative: true }, { title: 'Rotate right' }),
              entry({ type: 'rotate', degrees: 0 }, { title: 'Straighten' }),
              entry({ type: 'view', action: 'mirror' }, { current: view.mirrored })
            ]
          }
        ],
        value: { intent: (percent) => (percent > 0 ? { type: 'zoom', percent } : undefined), unit: '%', direct: false },
        groups: ['View'],
        prompt: 'Zoom: 200, or a view command'
      };
    }
  }
}

/** A brush size intent within what the parser accepts. */
function sizeIntent(px: number): Intent {
  return { type: 'size', px: Math.min(5000, Math.max(0.5, Math.round(px * 10) / 10)) };
}

/** The brush tool, its preset and size: `Brush · Soft round · 24 px`. */
function brushTitle(session: PaintSession, tool: string) {
  const preset = session.paintsWithBrush() ? session.library.find(session.tools.preset())?.name : undefined;
  return [tool, preset, `${formatSize(session.brush().size)} px`].filter(Boolean).join(' · ');
}

function describeSelectionTool(tool: SelectionTool, context: PaletteContext) {
  return parsedEntry([{ type: 'selection-tool', tool }], context).title;
}

/** A brush size for display: tenths below 10 px, whole pixels above. */
function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}

const sizeSteps = [4, 8, 16, 32, 64, 128];
const brushCount = 6;
const swatchCount = 12;
const selectionTools: readonly SelectionTool[] = ['lasso', 'polygon', 'rectangle', 'ellipse', 'wand'];
const selectionKeys: Partial<Record<SelectionTool, string>> = { lasso: 'L', wand: 'W' };
const selectionToolTitles: Record<SelectionTool, string> = {
  lasso: 'Lasso',
  polygon: 'Polygon',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  wand: 'Wand'
};
