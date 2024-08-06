import type { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { GL_CONST } from '@packages/webgl/static-variables/static-variables';

export const DEFAULTS_RENDER_TARGET_OPTIONS: Partial<RenderTargetOptions> = {
  width: 1024,
  height: 1024,
  type: GL_DATA_TYPE.HALF_FLOAT,
  format: GL_CONST.RGBA,
  internalFormat: GL_CONST.RGBA16F,
  depth: false,
  premultiplyAlpha: true
};
