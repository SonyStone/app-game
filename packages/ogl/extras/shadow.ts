import { Camera } from '../core/camera';
import { Program } from '../core/program';
import { RenderTarget } from '../core/render-target';

import defaultFragment from './shadow.frag';
import defaultVertex from './shadow.vert';

import { Mesh } from '../core/mesh';
import type { OGLRenderingContext } from '../core/renderer';
import type { Transform } from '../core/transform';

export interface ShadowOptions {
  light: Camera;
  width: number;
  height: number;
}

/**
 * Shadow map.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/Shadow.js | Source}
 */
export class Shadow {
  gl: OGLRenderingContext;

  light: Camera;

  target: RenderTarget;
  targetUniform: { value: RenderTarget['texture'] | null };

  depthProgram: Program;

  castMeshes: Mesh[];

  constructor(
    gl: OGLRenderingContext,
    { light = new Camera(gl), width = 1024, height = width }: Partial<ShadowOptions>
  ) {
    this.gl = gl;

    this.light = light;

    this.target = new RenderTarget(gl, { width, height });
    this.targetUniform = { value: this.target.texture };

    this.depthProgram = new Program(gl, {
      vertex: defaultVertex,
      fragment: defaultFragment,
      cullFace: false
    });

    this.castMeshes = [];
  }

  add({
    mesh,
    receive = true,
    cast = true,
    vertex = defaultVertex,
    fragment = defaultFragment,
    uniformProjection = 'shadowProjectionMatrix',
    uniformView = 'shadowViewMatrix',
    uniformTexture = 'tShadow'
  }: {
    mesh: Mesh;
    receive?: boolean;
    cast?: boolean;
    vertex?: string;
    fragment?: string;
    uniformProjection?: string;
    uniformView?: string;
    uniformTexture?: string;
  }): void {
    // Add uniforms to existing program
    if (receive && !mesh.program.uniforms[uniformProjection]) {
      mesh.program.uniforms[uniformProjection] = { value: this.light.projectionMatrix };
      mesh.program.uniforms[uniformView] = { value: this.light.viewMatrix };
      mesh.program.uniforms[uniformTexture] = this.targetUniform;
    }

    if (!cast) {
      return;
    }
    this.castMeshes.push(mesh);

    // Store program for when switching between depth override
    (mesh as any).colorProgram = mesh.program;

    // Check if depth program already attached
    if ((mesh as any).depthProgram) {
      return;
    }

    // Use global depth override if nothing custom passed in
    if (vertex === defaultVertex && fragment === defaultFragment) {
      (mesh as any).depthProgram = this.depthProgram;
      return;
    }

    // Create custom override program
    (mesh as any).depthProgram = new Program(this.gl, {
      vertex,
      fragment,
      cullFace: false
    });
  }

  setSize({ width = 1024, height = width }: { width?: number; height?: number }): void {
    this.target = new RenderTarget(this.gl, { width, height });
    this.targetUniform.value = this.target.texture;
  }

  render({ scene }: { scene: Transform }): void {
    // For depth render, replace program with depth override.
    // Hide meshes not casting shadows.
    scene.traverse((node) => {
      if (!isMesh(node)) {
        return;
      }

      if (!!~this.castMeshes.indexOf(node as Mesh)) {
        node.program = (node as any).depthProgram;
      } else {
        (node as any).isForceVisibility = node.visible;
        node.visible = false;
      }
    });

    // Render the depth shadow map using the light as the camera
    this.gl.renderer.render({
      scene,
      camera: this.light,
      target: this.target
    });

    // Then switch the program back to the normal one
    scene.traverse((node) => {
      if (!isMesh(node)) {
        return;
      }

      if (!!~this.castMeshes.indexOf(node)) {
        node.program = (node as any).colorProgram;
      } else {
        node.visible = (node as any).isForceVisibility;
      }
    });
  }
}

function isMesh(node: Transform | Mesh): node is Mesh {
  return !!(node as Mesh).draw;
}
