import { Brand } from "./Brand.type";

/**
 * Кадр ролика целое число `int`
 */
export type Frame = Brand<number, 'Frame'>;

export const PLUS_FRAME = 1 as Frame;
export const MINUS_FRAME = -1 as Frame;