import {
  BufferGeometry,
  Float32BufferAttribute,
  Material,
  Mesh,
  OrthographicCamera,
  WebGLRenderer,
} from 'three';

export abstract class Pass {
  // if set to true, the pass is processed by the composer
  enabled = true;

  // if set to true, the pass indicates to swap read and write buffer after rendering
  needsSwap = true;

  // if set to true, the pass clears its buffer before rendering
  clear = false;

  // if set to true, the result of the pass is rendered to screen. This is set automatically by EffectComposer.
  renderToScreen = false;

  setSize(width?: number, height?: number) {}

  render(
    renderer: WebGLRenderer,
    writeBuffer: any,
    readBuffer: any,
    deltaTime?: any,
    maskActive?: any
  ) {
    console.error('THREE.Pass: .render() must be implemented in derived pass.');
  }
}

// Helper for passes that need to fill the viewport with a single quad.

const _camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

// https://github.com/mrdoob/three.js/pull/21358

const _geometry = new BufferGeometry();
_geometry.setAttribute(
  'position',
  new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)
);
_geometry.setAttribute('uv', new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));

export class FullScreenQuad {
  private _mesh: Mesh;

  constructor(material?: Material | Material[]) {
    this._mesh = new Mesh(_geometry, material);
  }

  dispose() {
    this._mesh.geometry.dispose();
  }

  render(renderer: WebGLRenderer): void {
    renderer.render(this._mesh, _camera);
  }

  get material() {
    return this._mesh.material;
  }

  set material(value) {
    this._mesh.material = value;
  }
}
