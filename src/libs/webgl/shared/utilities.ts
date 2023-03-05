import { typename } from "./base";

export function isTypedArray(value?: any): boolean {
  if (value) {
    switch (typename(value)) {
      case "Int8Array":
      case "Uint8Array":
      case "Int16Array":
      case "Uint16Array":
      case "Int32Array":
      case "Uint32Array":
      case "Float32Array":
        return true;
    }
    return false;
  } else {
    return false;
  }
}

export function arrayCompare(a: any[], b: any[]): boolean {
  if (a && b && a.length == b.length) {
    for (var n = 0; n < a.length; n++) {
      if (a[n] !== b[n]) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
}

export function isWebGLResource(value?: any): boolean {
  if (value) {
    switch (typename(value)) {
      case "WebGLBuffer":
      case "WebGLFramebuffer":
      case "WebGLProgram":
      case "WebGLRenderbuffer":
      case "WebGLShader":
      case "WebGLTexture":
      case "WebGLQuery":
      case "WebGLSampler":
      case "WebGLSync":
      case "WebGLTransformFeedback":
      case "WebGLVertexArrayObject":
        return true;
    }
    return false;
  } else {
    return false;
  }
}
