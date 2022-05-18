import { ShaderFactory } from './fungi/Shader';

import vertSrc from './postShader.vert?raw';
import fragSrc from './postShader.frag?raw';

export const PostShader = {
  new: (shader: ShaderFactory) => {
    return shader.new_material('PostRender');
  },
  init: (shader: ShaderFactory) => {
    shader.new('PostRender', vertSrc, fragSrc, [
      { name: 'buf_color', type: 'sampler2D' },
    ]);
    return this;
  },
};
