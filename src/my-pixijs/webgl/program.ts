import { compileShader } from './compileShader';
import { getAttributeData, AttributeData } from './getAttributeData';
import { getUniformData, UniformData } from './getUniformData';
import { linkProgram } from './linkProgram';

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

export function getProgram(
  gl: WebGLRenderingContextBase,
  vertexSrc: string,
  fragmentSrc: string
): Program {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);

  const glPprogram = linkProgram(gl, vertShader, fragShader);

  const attributeData = getAttributeData(glPprogram, gl);
  const uniformData = getUniformData(glPprogram, gl);

  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  const program = {
    id: UID++,
    program: glPprogram,
    vertexSrc,
    fragmentSrc,
    attributeData,
    uniformData,
    useProgram() {
      gl.useProgram(glPprogram);
    },
  };

  return program;
}
