declare const __brand: unique symbol;

export type Brand<TData, TLabel extends string> = TData & { [__brand]: TLabel };
