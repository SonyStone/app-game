// ============================================================================
// MARK: Item Identity
// ============================================================================

/** Branded string type for type-safe item identification. */
export type ItemId = string & { readonly __brand: 'ItemId' };

export function createItemId(value: string): ItemId {
  return value as ItemId;
}

// ============================================================================
// MARK: Layout Modes
// ============================================================================

export type LayoutMode = 'vertical' | 'horizontal' | 'grid';
export type ListAxis = 'vertical' | 'horizontal';

export type GridConfig = {
  /** Number of columns, or 'auto' to compute from container width + columnWidth. */
  columns: number | 'auto';
  /** Fixed column width in pixels (required when columns is 'auto'). */
  columnWidth?: number;
  /** Row height in pixels, or 'auto' for content-sized rows. */
  rowHeight?: number | 'auto';
  /** Gap between items in pixels, or [rowGap, columnGap]. */
  gap: number | [number, number];
};

// ============================================================================
// MARK: NestableContainer
// ============================================================================

import type { Accessor } from 'solid-js';
import type { Rect } from './rect';

/**
 * Describes a container in a nestable drag-and-drop tree.
 *
 * This type is defined in `core/` so that both the pure tree utilities
 * (`tree.ts`) and the reactive primitives (`createNestable`) can share
 * it without creating a core ← primitives dependency.
 */
export type NestableContainer<K> = {
  /** Unique key for this container. */
  key: K;
  /** Ordered list of child item keys in this container. */
  items: Accessor<K[]>;
  /** Tags this container accepts. `undefined` = accept everything. */
  acceptTags?: string[];
  /** Returns the bounding rect for an item by its key. */
  getRect: (key: K) => Rect | undefined;
  /** Returns the bounding rect for the container element. */
  getContainerRect: () => Rect | undefined;
};
