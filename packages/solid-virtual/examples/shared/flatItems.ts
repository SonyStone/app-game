import { getRandomObject } from './getRandomObject';

/** Creates the editable records shared by the flat-list examples. */
export function createFlatItems(count = DEFAULT_ITEM_COUNT): FlatItem[] {
  return Array.from({ length: count }, (_, index) => createFlatItem(index));
}

/** Creates one editable flat-list record. */
export function createFlatItem(index: number): FlatItem {
  return {
    id: `item-${index}` as ItemId,
    index,
    data: getRandomObject()
  };
}

declare const itemIdBrand: unique symbol;

/** Stable example-only identifier for one editable flat-list item. */
export type ItemId = string & { readonly [itemIdBrand]: true };

/** Editable data rendered by the flat-list examples. */
export type FlatItem = {
  id: ItemId;
  index: number;
  data: Record<string, string>;
};

const DEFAULT_ITEM_COUNT = 200;
