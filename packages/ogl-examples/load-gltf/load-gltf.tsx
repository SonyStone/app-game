import { Camera, GLTF, GLTFLoader, Orbit, Program, Renderer, TextureLoader, Transform, Vec3 } from '@packages/ogl';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect } from 'solid-js';

import hershel from './hershel.glb?url';
import lut from './lut.png?url';
import sunsetDiffuse from './sunset-diffuse-RGBM.png?url';
import sunsetSpecular from './sunset-specular-RGBM.png?url';

import { makeEventListener } from '@solid-primitives/event-listener';
import createRAF from '@solid-primitives/raf';
import shaderFragment from './shader.frag?raw';
import shaderVertex from './shader.vert?raw';

export default function loadGltf() {
  const renderer = new Renderer({ dpr: 2 });
  const gl = renderer.gl;
  gl.clearColor(0.1, 0.1, 0.1, 1);

  const camera = new Camera({ near: 1, far: 1000 });
  // camera.position.set(60, 25, -60);
  camera.position.set(30, 15, -30);
  const controls = new Orbit(camera);
  // controls.target.y = 25;

  const resize = createWindowSize();
  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  let gltf: GLTF;

  // Common textures for uber shader
  const lutTexture = TextureLoader.load(gl, {
    src: lut
  });
  const envDiffuseTexture = TextureLoader.load(gl, {
    src: sunsetDiffuse
  });
  const envSpecularTexture = TextureLoader.load(gl, {
    src: sunsetSpecular
  });

  {
    loadInitial();
    makeEventListener(gl.canvas, 'dragover', over);
    makeEventListener(gl.canvas, 'drop', drop);
  }

  async function loadInitial() {
    gltf = await GLTFLoader.load(gl, hershel);
    addGLTF(gltf);
  }

  function over(e: any) {
    e.preventDefault();
  }

  function drop(e: any) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const reader = new FileReader();
    const isGLB = file.name.match(/\.glb$/);

    if (isGLB) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }

    reader.onload = async function (e: any) {
      let desc;
      if (isGLB) {
        desc = GLTFLoader.unpackGLB(e.target.result);
      } else {
        desc = JSON.parse(e.target.result);
      }
      const dir = '';
      gltf = await GLTFLoader.parse(gl, desc, dir);
      addGLTF(gltf);
    };
  }

  function addGLTF(gltf: GLTF) {
    scene.children.forEach((child) => child.setParent(null));
    console.log(gltf);

    const s = gltf.scene || gltf.scenes[0];
    s.forEach((root) => {
      root.setParent(scene);
      root.traverse((node) => {
        if ((node as any).program) {
          (node as any).program = createProgram(node);
        }
      });
    });

    // Calculate world matrices for bounds
    scene.updateMatrixWorld();

    // Calculate rough world bounds to update camera
    const min = new Vec3(+Infinity);
    const max = new Vec3(-Infinity);
    const center = new Vec3();
    const scale = new Vec3();

    const boundsMin = new Vec3();
    const boundsMax = new Vec3();
    const boundsCenter = new Vec3();
    const boundsScale = new Vec3();

    gltf.meshes.forEach((group) => {
      group.primitives.forEach((mesh) => {
        if (!mesh.parent) return; // Skip unattached

        // TODO: for skins, go over joints, not mesh
        // if (mesh instanceof GLTFSkin) return; // Skip skinned geometry
        if (!mesh.geometry.bounds) mesh.geometry.computeBoundingSphere();

        boundsCenter.copy(mesh.geometry.bounds.center).applyMatrix4(mesh.worldMatrix);

        // Get max world scale axis
        mesh.worldMatrix.getScaling(boundsScale);
        const radiusScale = Math.max(Math.max(boundsScale[0], boundsScale[1]), boundsScale[2]);
        const radius = mesh.geometry.bounds.radius * radiusScale;

        boundsMin.set(-radius).add(boundsCenter);
        boundsMax.set(+radius).add(boundsCenter);

        // Apply world matrix to bounds
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], boundsMin[i]);
          max[i] = Math.max(max[i], boundsMax[i]);
        }
      });
    });
    scale.sub(max, min);
    const maxRadius = Math.max(Math.max(scale[0], scale[1]), scale[2]) * 0.5;
    center.add(min, max).divide(2);

    camera.position
      .set(1, 0.5, -1)
      .normalize()
      .multiply(maxRadius * 2.5)
      .add(center);
    controls.target.copy(center);
    controls.forcePosition();
    const far = maxRadius * 5;
    const near = far * 0.001;
    camera.perspective({ near, far });
  }

  function createProgram(node: any) {
    const gltf = node.program.gltfMaterial || {};
    let vertex = shaderVertex;
    let fragment = shaderFragment;

    const vertexPrefix = /* glsl */ `#version 300 es
            #define attribute in
            #define varying out
            #define texture2D texture
        `;
    const fragmentPrefix = /* glsl */ `#version 300 es
            precision highp float;
            #define varying in
            #define texture2D texture
            #define gl_FragColor FragColor
            out vec4 FragColor;
        `;

    let defines = `
      ${node.geometry.attributes.uv ? `#define UV` : ``}
      ${node.geometry.attributes.normal ? `#define NORMAL` : ``}
      ${node.geometry.isInstanced ? `#define INSTANCED` : ``}
      ${node.boneTexture ? `#define SKINNING` : ``}
      ${gltf.alphaMode === 'MASK' ? `#define ALPHA_MASK` : ``}
      ${gltf.baseColorTexture ? `#define COLOR_MAP` : ``}
      ${gltf.normalTexture ? `#define NORMAL_MAP` : ``}
      ${gltf.metallicRoughnessTexture ? `#define RM_MAP` : ``}
      ${gltf.occlusionTexture ? `#define OCC_MAP` : ``}
      ${gltf.emissiveTexture ? `#define EMISSIVE_MAP` : ``}
  `;

    vertex = vertexPrefix + defines + vertex;
    fragment = fragmentPrefix + defines + fragment;

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uBaseColorFactor: { value: gltf.baseColorFactor || [1, 1, 1, 1] },
        tBaseColor: { value: gltf.baseColorTexture ? gltf.baseColorTexture.texture : null },

        tRM: { value: gltf.metallicRoughnessTexture ? gltf.metallicRoughnessTexture.texture : null },
        uRoughness: { value: gltf.roughnessFactor !== undefined ? gltf.roughnessFactor : 1 },
        uMetallic: { value: gltf.metallicFactor !== undefined ? gltf.metallicFactor : 1 },

        tNormal: { value: gltf.normalTexture ? gltf.normalTexture.texture : null },
        uNormalScale: { value: gltf.normalTexture ? gltf.normalTexture.scale || 1 : 1 },

        tOcclusion: { value: gltf.occlusionTexture ? gltf.occlusionTexture.texture : null },

        tEmissive: { value: gltf.emissiveTexture ? gltf.emissiveTexture.texture : null },
        uEmissive: { value: gltf.emissiveFactor || [0, 0, 0] },

        tLUT: { value: lutTexture },
        tEnvDiffuse: { value: envDiffuseTexture },
        tEnvSpecular: { value: envSpecularTexture },
        uEnvDiffuse: { value: 0.5 },
        uEnvSpecular: { value: 0.5 },

        uLightDirection: { value: new Vec3(0, 1, 1) },
        uLightColor: { value: new Vec3(2.5) },

        uAlpha: { value: 1 },
        uAlphaCutoff: { value: gltf.alphaCutoff }
      },
      transparent: gltf.alphaMode === 'BLEND',
      cullFace: gltf.doubleSided ? false : gl.BACK
    });

    return program;
  }

  function update() {
    // Play first animation
    if (gltf && gltf.animations && gltf.animations.length) {
      let { animation } = gltf.animations[0];
      animation.elapsed += 0.01;
      animation.update();
    }

    controls.update();
    renderer.render({ scene, camera, sort: false, frustumCull: false });
  }

  const [running, start, stop] = createRAF(update);
  start();

  return gl.canvas;
}
