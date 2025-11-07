export type AnyTreeView<Key extends string, T = object> = { [K in Key]?: AnyTreeView<Key, T>[] } & T;
