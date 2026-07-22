declare const itemIdBrand: unique symbol;

/** Stable example-only identifier for one editable flat-list item. */
export type ItemId = string & { readonly [itemIdBrand]: true };

/** Editable data rendered by the flat-list examples. */
export type FlatItem = {
  id: ItemId;
  index: number;
  data: Record<string, string>;
};
