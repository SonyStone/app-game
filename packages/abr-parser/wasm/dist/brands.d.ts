/** Unit brands exist only in TypeScript; runtime values remain ordinary numbers. */
declare const unitBrand: unique symbol;
/** Percentage unit. The permitted range belongs to each field, not this unit. */
export type Percent = number & {
    readonly [unitBrand]: "Percent";
};
/** Angle in degrees. */
export type Degrees = number & {
    readonly [unitBrand]: "Degrees";
};
/** Pixel length; fractional values are valid. */
export type Pixels = number & {
    readonly [unitBrand]: "Pixels";
};
/** Validates finiteness; permits percentages over 100 and negative percentages. */
export declare function percent(value: number): Percent;
/** Validates finiteness; angle normalization is a field-specific operation. */
export declare function degrees(value: number): Degrees;
/** Validates a finite pixel length; the consuming field checks its permitted range. */
export declare function pixels(value: number): Pixels;
export {};
