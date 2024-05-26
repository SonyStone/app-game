import { Camera, Geometry, Mesh, Orbit, Program, Renderer, Transform, Vec3 } from '@packages/ogl';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';
import fragment from './meshing.frag?raw';
import vertex from './meshing.vert?raw';

export default function Meshing() {
  const canvas = (<canvas />) as HTMLCanvasElement;

  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera({ fov: 35 });
  camera.position.set(1, 1, 7);
  camera.lookAt([0, 0, 0]);
  const controls = new Orbit(camera);

  const resize = createWindowSize();

  createEffect(() => {
    renderer.setSize(resize.width, resize.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  const program = new Program(gl, { vertex, fragment });
  const mesh = new Mesh(gl, { geometry: new Geometry(gl, generateChunkMesh()), program });
  scene.addChild(mesh);

  let requestID = requestAnimationFrame(update);
  function update(t: number) {
    requestID = requestAnimationFrame(update);

    controls.update();
    renderer.render({ scene, camera });
  }

  onCleanup(() => {
    cancelAnimationFrame(requestID);
  });

  return canvas;
}

/**
 * Generate a chunk mesh
 *
 * voxels
 *
 * group into 32x32x32 chunks
 * 12 triangles per voxel
 *
 * * when generating a mesh for the chunk, we skip the triangles between the voxels
 * * combine flat serface tringles into a single poligon
 * * compress vec3 position, vec3 normal, vec3 textureID into single intager
 *
 * position
 * every triangle aligned to the grid. So we can store the position in byte
 * * 32-bit float = 3.4 undecillion (big)
 * * 8-bit byte = 255
 * * 7 bits = 127
 * * 6 bits = 63 - enough space for 32 chunks
 *
 * 6 bits for each xyz axis
 * ```
 * zzzzzz yyyyyy xxxxxx
 * 6 bits 6 bits 6 bits
 * ```
 *
 * normal vector only 6 possabel values
 * * Y+ = 0
 * * Y- = 1
 * * X+ = 2
 * * X- = 3
 * * Z+ = 4
 * * Z- = 5
 *
 * 3 bits for each xyz normal axis
 * ```
 *  fff
 * 3 bits
 * ```
 *
 * textureID
 * only 70 unique textures
 * = 7 bits for textureID
 * ```
 * ttttttt
 * 7 bits
 * ```
 *
 * bit mask to get data in vertex shader
 * ```
 * 0000 ttttttt fff zzzzzz yyyyyy xxxxxx
 * ```
 * ```glsl
 * int positionX = data & 63;
 * int positionY = (data >> 6) & 63;
 * int positionZ = (data >> 12) & 63;
 * int normal = (data >> 18) & 7;
 * int textureID = (data >> 21) & 63;
 * ```
 *
 * base model of voxelface that instansing it
 *
 * glDrawArraysInstanced (glDrawArraysInstancedBaseInstance OpenGL 4.2)
 *
 * we use Combined Buffer
 * Indirect Buffer
 *
 * (glMultiDrawElementsIndirect OpenGL 4.3)
 *
 * shader storage buffer object (SSBO)
 */

function generateChunkMesh() {
  const num = 24;
  // normals  triangle positions
  // fff      zzzzzzyyyyyyxxxxxx
  // batch
  const position = new Float32Array(num * 3);

  buildFrontFace(position);
  buildBackFace(position);

  return {
    position: { size: 3, data: position }
  };

  // for (let x = 0; x < 32; x++) {
  //   for (let y = 0; y < 32; y++) {
  //     for (let z = 0; z < 32; z++) {
  //       const voxel = getVoxel(x, y, z);

  //       if (voxel.empty) {
  //         continue;
  //       }
  //     }
  //   }
  // }
}

function getVoxel(x: number, y: number, z: number) {
  const voxel = {
    position: [x, y, z],
    color: [Math.random(), Math.random(), Math.random()],
    empty: false
  };
  return voxel;
}

/**
 * should create a plane without indicex buffer
 */
function buildFrontFace(position: Float32Array, offset: number = 0) {
  // Define the vertices for a plane

  //  4 --- 3/6
  //  |      |
  // 0/5 --- 1
  // prettier-ignore
  const vertices = [
    -1.0, -1.0, 1.0,
    1.0, -1.0, 1.0,
    1.0, 1.0, 1.0,
    -1.0, 1.0, 1.0,
    -1.0, -1.0, 1.0,
    1.0, 1.0, 1.0,
  ];

  // Load the vertices into the position buffer
  for (let i = 0; i < vertices.length; i++) {
    position[i + offset * 3] = vertices[i];
  }
}

function buildBackFace(position: Float32Array, offset: number = 6) {
  // Define the vertices for a plane

  //  4 --- 3/6
  //  |      |
  // 0/5 --- 1
  // prettier-ignore
  const vertices = [
    -1.0, -1.0, -1.0,
    1.0, 1.0, -1.0,
    1.0, -1.0, -1.0,
    -1.0, 1.0, -1.0,
    1.0, 1.0, -1.0,
    -1.0, -1.0, -1.0,
  ];

  // Load the vertices into the position buffer
  for (let i = 0; i < vertices.length; i++) {
    position[i + offset * 3] = vertices[i];
  }
}

function addTopFace() {}

interface Voxel {
  index: number;
}

const normals = [
  new Vec3(0, 1, 0), // Y+ // 0
  new Vec3(0, -1, 0), // Y- // 1
  new Vec3(1, 0, 0), // X+ // 2
  new Vec3(-1, 0, 0), // X- // 3
  new Vec3(0, 0, 1), // Z+ // 4
  new Vec3(-1, 0, 0) // Z- // 5
];
