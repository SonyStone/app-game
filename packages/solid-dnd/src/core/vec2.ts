// MARK: Vec2 — 2D vector / point

export type Vec2 = Readonly<{ x: number; y: number }>;

export const Zero: Vec2 = { x: 0, y: 0 };

export function of(x: number, y: number): Vec2 {
  return { x, y };
}
