import { GL_CONST } from '@packages/webgl/static-variables/static-variables';
import { isBuiltIn } from './isBuiltIn';
import { ArrayTypeInfo, SamplerTypeInfo, SamplerTypeMapKeys, Setter, TypeInfo, TypeMapKeys, typeMap } from './typeMap';

export type SetterWithLocation = Setter & { location: WebGLUniformLocation };

/**
 * Creates setter functions for all uniforms of a shader
 * program.
 */
export function createUniformSetters(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): Record<string, SetterWithLocation> {
  let textureUnit = 0;

  const numUniforms = gl.getProgramParameter(program, GL_CONST.ACTIVE_UNIFORMS);

  const uniformSetters: Record<string, SetterWithLocation> = {};

  for (let uniformIndex = 0; uniformIndex < numUniforms; ++uniformIndex) {
    const uniformInfo = gl.getActiveUniform(program, uniformIndex)!;
    if (isBuiltIn(uniformInfo)) {
      continue;
    }

    console.log('uniformInfo', uniformInfo);

    let name = uniformInfo.name;
    // remove the array suffix.
    if (name.endsWith('[0]')) {
      name = name.substring(0, name.length - 3);
    }

    const location = gl.getUniformLocation(program, uniformInfo.name)!;
    // the uniform will have no location if it's in a uniform block
    if (location) {
      // create uniform setter
      const isArray = uniformInfo.name.endsWith('[0]');
      const type = uniformInfo.type as TypeMapKeys;
      const typeInfo = typeMap[type];
      if (!typeInfo) {
        throw new Error(`unknown type: 0x${type.toString(16)}`); // we should never get here.
      }
      let setter;
      if (isSamplerTypeInfo(typeInfo)) {
        // it's a sampler
        const unit = textureUnit;
        textureUnit += uniformInfo.size;
        if (isArray) {
          setter = typeInfo.arraySetter(
            gl,
            type as SamplerTypeMapKeys,
            unit,
            location,
            uniformInfo.size
          ) as SetterWithLocation;
        } else {
          setter = typeInfo.setter(gl, type as SamplerTypeMapKeys, unit, location) as SetterWithLocation;
        }
      } else {
        if (isArrayTypeInfo(typeInfo) && isArray) {
          setter = typeInfo.arraySetter(gl, location) as SetterWithLocation;
        } else {
          setter = typeInfo.setter(gl, location) as SetterWithLocation;
        }
      }
      setter.location = location;

      uniformSetters[name] = setter;
    }
  }

  return uniformSetters;
}

function isSamplerTypeInfo(typeInfo: TypeInfo): typeInfo is SamplerTypeInfo {
  return (typeInfo as SamplerTypeInfo).bindPoint !== undefined;
}

function isArrayTypeInfo(typeInfo: TypeInfo): typeInfo is ArrayTypeInfo {
  return (typeInfo as ArrayTypeInfo).arraySetter !== undefined;
}
