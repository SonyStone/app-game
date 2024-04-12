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

  constructor(readonly contextInformation: IContextInformation) {
    this.webGlObjects = [];
    this.initWebglObjects();
  }

  tagWebGlObjects(functionInformation: IFunctionInformation) {
    for (const webGlObject of this.webGlObjects) {
      for (let i = 0; i < functionInformation.arguments.length; i++) {
        const arg = functionInformation.arguments[i];
        if (webGlObject.tagWebGlObject(arg)) {
          break;
        }
      }
      if (webGlObject.tagWebGlObject(functionInformation.result)) {
        break;
      }
    }
  }

  tagWebGlObject(object: any): WebGlObjectTag {
    for (const webGlObject of this.webGlObjects) {
      const tag = webGlObject.tagWebGlObject(object);
      if (tag) {
        return tag;
      }
    }
    return undefined;
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
