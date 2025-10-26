/**
 * # The `Prettify` Helper
 *
 * https://www.totaltypescript.com/concepts/the-prettify-helper
 *
 * Let's imagine that you've got a type with multiple intersections:
 * ```typescript
 * type Intersected = {
 *   a: string;
 * } & {
 *   b: number;
 * } & {
 *   c: boolean;
 * };
 * ```
 * If you hover over Intersected, you'll see the following:
 *
 * ```typescript
 * { a: string; } & { b: number; } & { c: boolean; }
 * ```
 *
 * This is a little ugly. But we can wrap it in Prettify to make it more readable:
 *
 * ```typescript
 * type Intersected = Prettify<
 *   {
 *     a: string;
 *   } & {
 *     b: number;
 *   } & {
 *     c: boolean;
 *   }
 * >;
 * ```
 *
 * Now, if you hover over Intersected, you'll see this nice and clean type:
 *
 * ```typescript
 * {
 *   a: string;
 *   b: number;
 *   c: boolean;
 * }
 * ```
 */
export type Prettify<TObject> = {
  [Key in keyof TObject]: TObject[Key];
} & {};
