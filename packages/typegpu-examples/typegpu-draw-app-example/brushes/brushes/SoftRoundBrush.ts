/**
 * TypeGPU Drawing Framework - Soft Round Brush
 *
 * The default soft round brush with adjustable hardness.
 * Generates a circular brush texture on the GPU.
 */

import type { BrushDefinition } from '../../core/types';

/** Soft Round Brush Definition */
export const SoftRoundBrush: BrushDefinition = {
  id: 'soft-round',
  name: 'Soft Round',
  description: 'A soft circular brush with adjustable hardness',

  settings: {
    size: {
      min: 1,
      max: 500,
      default: 20,
      step: 1,
      label: 'Size'
    },
    opacity: {
      min: 0,
      max: 1,
      default: 1,
      step: 0.01,
      label: 'Opacity'
    },
    hardness: {
      min: 0,
      max: 1,
      default: 0.5,
      step: 0.01,
      label: 'Hardness'
    },
    spacing: {
      min: 1,
      max: 100,
      default: 25,
      step: 1,
      label: 'Spacing (%)'
    }
  }

  // Uses default point processing (interpolation with spacing)
  // Uses default texture generation (BrushTexture.ts)
  // Uses default fragment shader (brush-shaders.ts)
};

/** Hard Round Brush Definition */
export const HardRoundBrush: BrushDefinition = {
  id: 'hard-round',
  name: 'Hard Round',
  description: 'A hard circular brush with sharp edges',

  settings: {
    size: {
      min: 1,
      max: 500,
      default: 20,
      step: 1,
      label: 'Size'
    },
    opacity: {
      min: 0,
      max: 1,
      default: 1,
      step: 0.01,
      label: 'Opacity'
    },
    hardness: {
      min: 0.9,
      max: 1,
      default: 1,
      step: 0.01,
      label: 'Hardness'
    },
    spacing: {
      min: 1,
      max: 100,
      default: 10,
      step: 1,
      label: 'Spacing (%)'
    }
  }
};

/** Airbrush Definition (very soft) */
export const Airbrush: BrushDefinition = {
  id: 'airbrush',
  name: 'Airbrush',
  description: 'A very soft brush for smooth gradients',

  settings: {
    size: {
      min: 10,
      max: 500,
      default: 100,
      step: 1,
      label: 'Size'
    },
    opacity: {
      min: 0,
      max: 0.5,
      default: 0.1,
      step: 0.01,
      label: 'Flow'
    },
    hardness: {
      min: 0,
      max: 0.3,
      default: 0,
      step: 0.01,
      label: 'Hardness'
    },
    spacing: {
      min: 1,
      max: 50,
      default: 5,
      step: 1,
      label: 'Spacing (%)'
    }
  }
};

/** All built-in brushes */
export const BUILTIN_BRUSHES: BrushDefinition[] = [SoftRoundBrush, HardRoundBrush, Airbrush];
