export type Prettify<TObject> = {
  [Key in keyof TObject]: TObject[Key];
} & {};
