/* tslint:disable */
/* eslint-disable */
/**
 * @param {string} name
 * @returns {Element}
 */
export function greet(name: string): Element;
export class AppWebGL {
  free(): void;
  /**
   * @param {HTMLCanvasElement} canvas
   * @returns {AppWebGL}
   */
  static new(canvas: HTMLCanvasElement): AppWebGL;
  render(): void;
  /**
   * @param {number} width
   * @param {number} height
   */
  resize(width: number, height: number): void;
  /**
   * @returns {HTMLCanvasElement}
   */
  canvas(): HTMLCanvasElement;
  /**
   * @returns {WebGL2RenderingContext}
   */
  context(): WebGL2RenderingContext;
  /**
   * @param {PointerEvent} event
   */
  on_pointer_down(event: PointerEvent): void;
}
export class PointerEvent {
  free(): void;
  /**
   * @param {number} x
   * @param {number} y
   * @returns {PointerEvent}
   */
  static new(x: number, y: number): PointerEvent;
  /**
   * @returns {number}
   */
  x(): number;
  /**
   * @returns {number}
   */
  y(): number;
  /**
   * @param {number} x
   */
  set_x(x: number): void;
  /**
   * @param {number} y
   */
  set_y(y: number): void;
}
