import {
  Camera,
  Color,
  ColorRepresentation,
  Scene,
  WebGLRenderer,
} from 'three';
import { Pass } from './Pass.js';

export class RenderPass extends Pass {
  scene: Scene;
  camera: Camera;
  overrideMaterial: any;
  clearColor: ColorRepresentation | undefined;
  clearAlpha: number;

  clear = true;
  clearDepth = false;
  needsSwap = false;
  _oldClearColor = new Color();

  constructor(
    scene: Scene,
    camera: Camera,
    overrideMaterial?: any,
    clearColor?: ColorRepresentation,
    clearAlpha?: number
  ) {
    super();

    this.scene = scene;
    this.camera = camera;

    this.overrideMaterial = overrideMaterial;

    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 0;
  }

  render(
    renderer: WebGLRenderer,
    writeBuffer: any,
    readBuffer: any /*, deltaTime, maskActive */
  ) {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearAlpha, oldOverrideMaterial;

    if (this.overrideMaterial !== undefined) {
      oldOverrideMaterial = this.scene.overrideMaterial;

      this.scene.overrideMaterial = this.overrideMaterial;
    }

    if (this.clearColor) {
      renderer.getClearColor(this._oldClearColor);
      oldClearAlpha = renderer.getClearAlpha();

      renderer.setClearColor(this.clearColor, this.clearAlpha);
    }

    if (this.clearDepth) {
      renderer.clearDepth();
    }

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

    // TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
    if (this.clear)
      renderer.clear(
        renderer.autoClearColor,
        renderer.autoClearDepth,
        renderer.autoClearStencil
      );
    renderer.render(this.scene, this.camera);

    if (this.clearColor) {
      renderer.setClearColor(this._oldClearColor, oldClearAlpha);
    }

    if (this.overrideMaterial !== undefined) {
      this.scene.overrideMaterial = oldOverrideMaterial as any;
    }

    renderer.autoClear = oldAutoClear;
  }
}
