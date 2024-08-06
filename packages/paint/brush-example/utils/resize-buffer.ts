import { Attribute } from '@packages/ogl/core/geometry';

export const resizeBuffer = (attribute: Pick<Attribute, 'data' | 'needsUpdate'>, offset: number) => {
  let bufferSize = attribute.data.length;

  if (offset >= bufferSize) {
    while (offset >= bufferSize) {
      bufferSize *= 2;
    }
    const buffer = new Float32Array(bufferSize);
    buffer.set(attribute.data);
    attribute.data = buffer;
    attribute.needsUpdate = true;
  }
};
