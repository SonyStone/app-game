/**
 * TypeGPU Drawing Framework - GPU Context
 *
 * Wrapper around WebGPU/TypeGPU initialization.
 * Handles device acquisition, canvas configuration, and format detection.
 */

import tgpu, { type TgpuRoot } from 'typegpu';

/** GPU Context configuration */
export interface GPUContextConfig {
  /** Canvas element to render to */
  canvas: HTMLCanvasElement;
  /** Preferred alpha mode */
  alphaMode?: GPUCanvasAlphaMode;
  /** Power preference for adapter */
  powerPreference?: GPUPowerPreference;
}

/** GPU Context state */
export interface GPUContextState {
  /** TypeGPU root */
  root: TgpuRoot;
  /** Canvas context */
  context: GPUCanvasContext;
  /** Preferred texture format */
  format: GPUTextureFormat;
  /** Canvas element */
  canvas: HTMLCanvasElement;
}

/**
 * Initialize GPU context with TypeGPU.
 * Returns all necessary GPU resources for rendering.
 */
export async function createGPUContext(config: GPUContextConfig): Promise<GPUContextState> {
  const { canvas, alphaMode = 'premultiplied', powerPreference = 'high-performance' } = config;

  // Check WebGPU support
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser');
  }

  // Initialize TypeGPU with power preference
  const root = await tgpu.init({
    adapter: { powerPreference }
  });

  // Get canvas context
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get WebGPU canvas context');
  }

  // Get preferred format
  const format = navigator.gpu.getPreferredCanvasFormat();

  // Configure canvas
  context.configure({
    device: root.device,
    format,
    alphaMode
  });

  return {
    root,
    context,
    format,
    canvas
  };
}

/**
 * Resize canvas to match display size.
 * Returns true if size changed.
 */
export function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): boolean {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }

  return false;
}

/**
 * Get current display dimensions of a canvas.
 */
export function getDisplaySize(canvas: HTMLCanvasElement): { width: number; height: number } {
  return {
    width: canvas.clientWidth,
    height: canvas.clientHeight
  };
}

/**
 * Destroy GPU context and release resources.
 */
export function destroyGPUContext(state: GPUContextState): void {
  state.root.destroy();
  state.context.unconfigure();
}
