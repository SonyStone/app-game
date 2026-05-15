import type { GridConfig } from './types';

export type DetectedLayout =
  | { readonly mode: 'vertical' }
  | { readonly mode: 'horizontal' }
  | { readonly mode: 'grid'; readonly gridConfig: GridConfig };

/**
 * Auto-detect whether a container uses a vertical, horizontal, or grid layout by reading
 * its computed CSS properties.
 *
 * Detection rules:
 * - `display: grid | inline-grid` → grid (columns from `gridTemplateColumns`)
 * - `display: flex | inline-flex` + `flex-wrap: wrap | wrap-reverse` → grid
 * - `display: flex | inline-flex` without wrap → `vertical` or `horizontal`
 * - Everything else (block, etc.) → `vertical`
 *
 * For grid layouts, derives a `GridConfig` from the computed styles:
 * - `columns`: counted from resolved `gridTemplateColumns` track values
 * - `gap`: parsed from `rowGap` / `columnGap`
 * - `rowHeight`: `'auto'` (measured from first child at runtime)
 *
 * @param container  The container DOM element to inspect.
 * @returns Detected layout mode with grid config when applicable.
 *
 * @example
 * ```ts
 * const el = document.querySelector('.my-grid')!;
 * const layout = detectLayout(el);
 * if (layout.mode === 'grid') {
 *   console.log(layout.gridConfig.columns); // e.g., 4
 * }
 * ```
 */
export function detectLayout(container: HTMLElement): DetectedLayout {
  const style = getComputedStyle(container);
  const display = style.display;

  // CSS Grid → always grid
  if (display === 'grid' || display === 'inline-grid') {
    return { mode: 'grid', gridConfig: deriveGridConfig(style) };
  }

  // Flexbox with wrap → grid-like (multi-row)
  if (display === 'flex' || display === 'inline-flex') {
    const wrap = style.flexWrap;
    if (wrap === 'wrap' || wrap === 'wrap-reverse') {
      return { mode: 'grid', gridConfig: deriveFlexWrapConfig(container, style) };
    }

    return { mode: detectListAxis(style.flexDirection) };
  }

  // Block, etc. → vertical list
  return { mode: 'vertical' };
}

function detectListAxis(flexDirection: string): Exclude<DetectedLayout['mode'], 'grid'> {
  return flexDirection === 'row' || flexDirection === 'row-reverse' ? 'horizontal' : 'vertical';
}

/**
 * Derive GridConfig from a CSS grid container's computed styles.
 * @internal
 */
function deriveGridConfig(style: CSSStyleDeclaration): GridConfig {
  // gridTemplateColumns resolves to e.g. "200px 200px 200px" — count the values
  const columns = countGridColumns(style.gridTemplateColumns);
  const rowGap = parsePixels(style.rowGap);
  const colGap = parsePixels(style.columnGap);
  const gap: GridConfig['gap'] = rowGap === colGap ? rowGap : [rowGap, colGap];

  return { columns, gap, rowHeight: 'auto' };
}

/**
 * Derive GridConfig from a flex-wrap container by measuring child layout.
 * @internal
 */
function deriveFlexWrapConfig(container: HTMLElement, style: CSSStyleDeclaration): GridConfig {
  const children = container.children;
  if (children.length === 0) {
    return { columns: 1, gap: 0, rowHeight: 'auto' };
  }

  // Count columns by checking how many children share the same top offset
  const firstTop = (children[0] as HTMLElement).offsetTop;
  let columns = 0;
  for (let i = 0; i < children.length; i++) {
    if ((children[i] as HTMLElement).offsetTop === firstTop) {
      columns++;
    } else {
      break;
    }
  }

  const rowGap = parsePixels(style.rowGap);
  const colGap = parsePixels(style.columnGap);
  const gap: GridConfig['gap'] = rowGap === colGap ? rowGap : [rowGap, colGap];

  return { columns: Math.max(1, columns), gap, rowHeight: 'auto' };
}

/**
 * Count the number of columns from a resolved `gridTemplateColumns` value.
 *
 * `getComputedStyle` always resolves to concrete pixel values like
 * `"200px 200px 200px"`, so we just count space-separated tokens.
 *
 * @internal
 */
function countGridColumns(gridTemplateColumns: string): number {
  const value = gridTemplateColumns.trim();
  if (!value || value === 'none') return 1;
  // Resolved values are always space-separated pixel values: "200px 200px 200px"
  return Math.max(1, value.split(/\s+/).length);
}

/**
 * Parse a CSS pixel value string (e.g. "8px") to a number.
 * Returns 0 for non-pixel or invalid values.
 * @internal
 */
function parsePixels(value: string): number {
  if (!value || value === 'normal') return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
