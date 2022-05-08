import fragSrc from './drawShader.frag?raw';
import vertSrc from './drawShader.vert?raw';
import { ShaderFactory } from './fungi/Shader';

export default {
  new: (shader: ShaderFactory) => {
    return shader.new_material('DrawShader');
  },
  init: (shader: ShaderFactory) => {
    shader.new('DrawShader', vertSrc, fragSrc, [
      { name: 'ortho', type: 'mat4' },
      //{ name:"move",	type:"vec2", value:null },
      { name: 'brush_size', type: 'float' },
      { name: 'bound', type: 'vec4' },
      { name: 'segment', type: 'vec4' },
    ]);
    return this;
  },
};
