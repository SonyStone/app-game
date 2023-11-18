import { IUniform, ShaderMaterial, UniformsUtils, WebGLRenderer } from 'three';

import { FullScreenQuad, Pass } from './Pass.js';

export class ShaderPass extends Pass {
  textureID: string;
  uniforms!: { [uniform: string]: IUniform };
  material!: ShaderMaterial;
  fsQuad: FullScreenQuad;

  constructor(shader: ShaderMaterial | any, textureID?: string) {
    super();

    this.textureID = textureID !== undefined ? textureID : 'tDiffuse';

    if (shader instanceof ShaderMaterial) {
      this.uniforms = shader.uniforms;

      this.material = shader;
    } else if (shader) {
      this.uniforms = UniformsUtils.clone(shader.uniforms);

      this.material = new ShaderMaterial({
        defines: Object.assign({}, shader.defines),
        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
      });
    }

    this.fsQuad = new FullScreenQuad(this.material);
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: any,
    readBuffer: any,
    deltaTime?: any,
    maskActive?: any
  ): void {
    if (this.uniforms[this.textureID]) {
      this.uniforms[this.textureID].value = readBuffer.texture;
    }

    this.fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      // TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
      if (this.clear)
        renderer.clear(
          renderer.autoClearColor,
          renderer.autoClearDepth,
          renderer.autoClearStencil
        );
      this.fsQuad.render(renderer);
    }
  }
}
