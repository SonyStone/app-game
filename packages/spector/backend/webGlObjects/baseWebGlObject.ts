export type WebGlObjectTag = {
  readonly typeName: string;
  readonly id: number;
  displayText?: string;
  customData?: any;
};

export class WebGlObjects {
  static getWebGlObjectTag(object: WebGLObject): WebGlObjectTag {
    return (object as any)[WebGlObjects.SPECTOROBJECTTAGKEY];
  }

  static attachWebGlObjectTag(object: WebGLObject, tag: WebGlObjectTag): void {
    tag.displayText = WebGlObjects.stringifyWebGlObjectTag(tag);
    (object as any)[WebGlObjects.SPECTOROBJECTTAGKEY] = tag;
  }

  static stringifyWebGlObjectTag(tag: WebGlObjectTag): string {
    if (!tag) {
      return 'No tag available.';
    }
    return `${tag.typeName} - ID: ${tag.id}`;
  }

  private static readonly SPECTOROBJECTTAGKEY = '__SPECTOR_Object_TAG';
}

// tslint:disable-next-line:max-classes-per-file
export abstract class BaseWebGlObject {
  abstract get typeName(): string;

  // tslint:disable-next-line:ban-types
  get type(): Function {
    return (window as any)[this.typeName] || null;
  }

  private id: number;

  constructor() {
    this.id = 0;
  }

  tagWebGlObject(webGlObject: any): WebGlObjectTag | undefined {
    if (!this.type) {
      return undefined;
    }

    let tag: WebGlObjectTag | undefined = undefined;
    if (!webGlObject) {
      return tag;
    }

    tag = WebGlObjects.getWebGlObjectTag(webGlObject);
    if (tag) {
      return tag;
    }

    if (webGlObject instanceof this.type) {
      const id = this.getNextId();
      tag = {
        typeName: this.typeName,
        id
      };
      WebGlObjects.attachWebGlObjectTag(webGlObject, tag);
      return tag;
    }

    return tag;
  }

  protected getNextId(): number {
    return this.id++;
  }
}
