import { AttribSetter, attrTypeMap, AttrTypeMapKeys } from './attrTypeMap';
import { isBuiltIn } from './isBuiltIn';

export type AttribSetterWithLocation = AttribSetter & { location: number };

export function createAttributeSetters(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): Record<string, AttribSetterWithLocation> {
  const attribSetters: Record<string, AttribSetterWithLocation> = {};

  const numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

  for (let attribIndex = 0; attribIndex < numAttribs; ++attribIndex) {
    const attribInfo: WebGLActiveInfo = gl.getActiveAttrib(program, attribIndex)!;
    if (isBuiltIn(attribInfo)) {
      continue;
    }

    console.log('attribInfo', attribInfo);

    const index = gl.getAttribLocation(program, attribInfo.name);
    const typeInfo = attrTypeMap[attribInfo.type as AttrTypeMapKeys];
    const setter = typeInfo.setter(gl, index, typeInfo as { size: number; count: number }) as AttribSetterWithLocation;
    setter.location = index;
    attribSetters[attribInfo.name] = setter;
  }

  return attribSetters;
}
