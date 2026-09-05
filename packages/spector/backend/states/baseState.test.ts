import { describe, expect, it, vi } from 'vitest';
import { WebGlObjects } from '../webGlObjects/baseWebGlObject';
import { BaseState } from './baseState';

describe('BaseState WebGL object capture', () => {
  it('registers an object that already has a tag with the current context spy', () => {
    const object = {};
    const existingTag = { typeName: 'WebGLBuffer', id: 42 };
    WebGlObjects.attachWebGlObjectTag(object, existingTag);
    const tagWebGlObject = vi.fn(() => existingTag);
    const state = new TestState({
      context: {} as WebGL2RenderingContext,
      contextVersion: 2,
      tagWebGlObject
    });

    expect(state.captureObject(object).__SPECTOR_Object_TAG).toBe(existingTag);
    expect(tagWebGlObject).toHaveBeenCalledWith(object);
  });
});

class TestState extends BaseState {
  get stateName(): string {
    return 'Test';
  }

  captureObject(object: object) {
    return this.getSpectorData(object);
  }

  protected readFromContext(): void {}
}
