export class Vector2 {

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  copy(src: Vector2): void {
    this.x = src.x;
    this.y = src.y;
  }

  reset(): void {
    this.set(0, 0);
  }
}
