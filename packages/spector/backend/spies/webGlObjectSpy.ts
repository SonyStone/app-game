import { IContextInformation } from '../types/contextInformation';
import { IFunctionInformation } from '../types/functionInformation';
import { BaseWebGlObject, WebGlObjectTag } from '../webGlObjects/baseWebGlObject';
import {
  Buffer,
  FrameBuffer,
  Program,
  Query,
  Renderbuffer,
  Sampler,
  Shader,
  Sync,
  Texture,
  TransformFeedback,
  UniformLocation,
  VertexArrayObject
} from '../webGlObjects/webGlObjects';

// tslint:disable:ban-types
// tslint:disable:only-arrow-functions
export class WebGlObjectSpy {
  private readonly webGlObjects: BaseWebGlObject[];
  private readonly taggedObjects = new Map<string, Map<number, object>>();

  constructor(readonly contextInformation: IContextInformation) {
    this.webGlObjects = [];
    this.initWebglObjects();
  }

  tagWebGlObjects(functionInformation: IFunctionInformation) {
    for (const webGlObject of this.webGlObjects) {
      for (let i = 0; i < functionInformation.arguments.length; i++) {
        const arg = functionInformation.arguments[i];
        const tag = webGlObject.tagWebGlObject(arg);
        if (tag) {
          this.rememberTaggedObject(arg, tag);
          break;
        }
      }
      const resultTag = webGlObject.tagWebGlObject(functionInformation.result);
      if (resultTag) {
        this.rememberTaggedObject(functionInformation.result, resultTag);
        break;
      }
    }
  }

  tagWebGlObject(object: any): WebGlObjectTag | undefined {
    for (const webGlObject of this.webGlObjects) {
      const tag = webGlObject.tagWebGlObject(object);
      if (tag) {
        this.rememberTaggedObject(object, tag);
        return tag;
      }
    }
    return undefined;
  }

  /** Returns a live WebGL object previously assigned the given capture tag. */
  getTaggedObject(typeName: string, id: number): object | undefined {
    return this.taggedObjects.get(typeName)?.get(id);
  }

  private rememberTaggedObject(object: unknown, tag: WebGlObjectTag): void {
    if (typeof object !== 'object' || object === null) return;
    let objects = this.taggedObjects.get(tag.typeName);
    if (!objects) {
      objects = new Map<number, object>();
      this.taggedObjects.set(tag.typeName, objects);
    }
    objects.set(tag.id, object);
  }

  private initWebglObjects(): void {
    this.webGlObjects.push(
      new Buffer(),
      new FrameBuffer(),
      new Program(),
      new Query(),
      new Renderbuffer(),
      new Sampler(),
      new Sync(),
      new Texture(),
      new TransformFeedback(),
      new UniformLocation(),
      new VertexArrayObject(),
      new Shader()
    );
  }
}
