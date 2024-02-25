import { compileShader } from '@packages/webgl/compileShader';
import { linkProgram } from '@packages/webgl/linkProgram';

import { AttributeData, getAttributeData } from './getAttributeData';
import { UniformData, getUniformData } from './getUniformData';

let UID = 0;

export interface Program {
  id: number;
  program: WebGLProgram;
  vertexSrc: string;
  fragmentSrc: string;
  attributeData: {
    [key: string]: AttributeData;
  };
  uniformData: {
    [key: string]: UniformData;
  };
  useProgram(): void;
}

export function getProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): Program {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);

  const glPprogram = linkProgram(gl, vertShader, fragShader);

  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  const attributeData = getAttributeData(gl, glPprogram);
  const uniformData = getUniformData(gl, glPprogram);

  const program = {
    id: UID++,
    program: glPprogram,
    vertexSrc,
    fragmentSrc,
    attributeData,
    uniformData,
    useProgram() {
      gl.useProgram(glPprogram);
    }
  };

  return program;
}
