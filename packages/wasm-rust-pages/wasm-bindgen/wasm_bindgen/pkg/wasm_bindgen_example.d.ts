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
  init(): void;
  update_camera(): void;
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
  /**
   * @param {PointerEvent} event
   */
  on_pointer_move(event: PointerEvent): void;
  /**
   * @param {PointerEvent} _event
   */
  on_pointer_up(_event: PointerEvent): void;
  /**
   * @param {PointerEvent} _event
   */
  on_pointer_enter(_event: PointerEvent): void;
  /**
   * @param {PointerEvent} _event
   */
  on_pointer_leave(_event: PointerEvent): void;
  /**
   * @param {KeyboardEvent} event
   */
  on_keydown(event: KeyboardEvent): void;
  /**
   * @param {WheelEvent} event
   */
  on_wheel(event: WheelEvent): void;
}
