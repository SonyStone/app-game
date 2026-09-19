/** Validates finiteness; permits percentages over 100 and negative percentages. */
export function percent(value) {
    return finite(value);
}
/** Validates finiteness; angle normalization is a field-specific operation. */
export function degrees(value) {
    return finite(value);
}
/** Validates a finite pixel length; the consuming field checks its permitted range. */
export function pixels(value) {
    return finite(value);
}
function finite(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new TypeError("Expected a finite number");
    return value;
}
