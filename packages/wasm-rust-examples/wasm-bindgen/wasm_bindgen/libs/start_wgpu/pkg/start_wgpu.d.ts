/* tslint:disable */
/* eslint-disable */
export class HelloTriangle {
  free(): void;
  /**
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<HelloTriangle>}
   */
  static new(canvas: HTMLCanvasElement): Promise<HelloTriangle>;
  /**
   * @param {number} height
   * @param {number} width
   */
  resize(height: number, width: number): void;
  redraw(): void;
}
