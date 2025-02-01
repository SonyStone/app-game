import { DEG_TO_RAD } from '@packages/math/constants';
import * as m4 from '@packages/math/m4';
import { compileShader } from '@packages/webgl/compileShader';
import { linkProgram } from '@packages/webgl/linkProgram';
import {
  GL_BUFFER_TYPE,
  GL_CLEAR_MASK,
  GL_DATA_TYPE,
  GL_SHADER_TYPE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES
} from '@packages/webgl/static-variables';
import { createEffect, onCleanup } from 'solid-js';

import { getAttributeData } from '@packages/pixijs-research/webgl/getAttributeData';
import { getUniformData } from '@packages/pixijs-research/webgl/getUniformData';
import { useCamera } from '@packages/three-examples/Camera.provider';
import { createProgramInfo } from '@packages/twgl/programs';
import {
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_PARAMETER_NAME,
  GL_TEXTURE_UNIT
} from '@packages/webgl/static-variables/textures';
import fragmentSrc from './frag_shader.frag?raw';
import vertexSrc from './vert_shader.vert?raw';

interface Attribute {
  enabled: boolean;
  size: number;
  type: number; // FLOAT
  int: boolean;
  normalize: false;
  stride: number;
  offset: number;
  divisor: number;
  buffer: WebGLBuffer; // texcoordBuffer, normalBuffer, positionBuffer etc
}

interface State {
  // ELEMENT_ARRAY_BUFFER
  buffer: WebGLBuffer; // indexBuffer
}

/**
 * Data Array for vertex shader
 */
interface VertexArray {
  attributes: { [key: string]: Attribute };
  indices: State;
}

/**
 * create
 */
// const programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);

export default function main() {
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  const scene = {
    vertex: vertexSrc,
    fragment: fragmentSrc,
    arrays: {
      a_position: [
        1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1,

        -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1,

        -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1,

        -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,

        1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1,

        -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1
      ],
      a_normal: [
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        -1
      ],
      a_texcoord: [
        1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0,
        1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1
      ],
      indices: [
        0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21,
        22, 20, 22, 23
      ]
    },
    uniforms: {
      u_lightWorldPos: [1, 8, -10],
      u_lightColor: [1, 0.8, 0.8, 1],
      u_ambient: [0, 0, 0, 1],
      u_specular: [1, 1, 1, 1],
      u_shininess: 50,
      u_specularFactor: 1,
      u_diffuse: {
        min: GL_TEXTURE_MIN_FILTER.NEAREST,
        mag: GL_TEXTURE_MAG_FILTER.NEAREST,
        src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255]
      }
    }
  };

  const gl = canvas.getContext('webgl2')!;

  console.log(`gl`, canvas, gl);

  const programInfo = createProgramInfo(gl, [scene.vertex, scene.fragment]);
  console.log(`programInfo`, programInfo);

  // gl program
  const program = createProgram(gl, scene.vertex, scene.fragment);

  const attributes = getAttributeData(gl, program);
  const uniforms = getUniformData(gl, program);

  console.log(`attributes`, attributes);
  console.log(`uniforms`, uniforms);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    GL_BUFFER_TYPE.ARRAY_BUFFER,
    new Float32Array(scene.arrays.a_position),
    GL_STATIC_VARIABLES.STATIC_DRAW
  );
  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(GL_BUFFER_TYPE.ARRAY_BUFFER, new Float32Array(scene.arrays.a_normal), GL_STATIC_VARIABLES.STATIC_DRAW);
  const texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.bufferData(
    GL_BUFFER_TYPE.ARRAY_BUFFER,
    new Float32Array(scene.arrays.a_texcoord),
    GL_STATIC_VARIABLES.STATIC_DRAW
  );
  const indicesBuffer = gl.createBuffer();
  gl.bindBuffer(GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, indicesBuffer);
  gl.bufferData(
    GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(scene.arrays.indices),
    GL_STATIC_VARIABLES.STATIC_DRAW
  );

  const tex = gl.createTexture();
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, tex);
  gl.texImage2D(
    GL_TEXTURES.TEXTURE_2D,
    0,
    GL_STATIC_VARIABLES.RGBA,
    2,
    2,
    0,
    GL_STATIC_VARIABLES.RGBA,
    GL_STATIC_VARIABLES.UNSIGNED_BYTE,
    new Uint8Array(scene.uniforms.u_diffuse.src)
  );
  gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURE_PARAMETER_NAME.TEXTURE_MIN_FILTER, scene.uniforms.u_diffuse.min);
  gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER, scene.uniforms.u_diffuse.mag);

  // buffers
  // textures
  // uniforms → set uniforms + textures (textures is uniforms too)

  // use program
  // set (BuffersAndAttributes / VertexArrayObject)
  // set uniforms

  gl.enable(GL_STATIC_VARIABLES.DEPTH_TEST);
  gl.enable(GL_STATIC_VARIABLES.CULL_FACE);

  const eye = [1, 4, -6];
  const target = [0, 0, 0];
  const up = [0, 1, 0];

  const camera = m4.lookAt(m4.identity(), eye, target, up);
  const view = m4.inverse(camera);

  let projection = m4.identity();
  let projectionInverse = m4.inverse(projection);
  let viewProjection = m4.identity();
  let world = m4.identity();

  console.log(`program`, program);

  // * before set uniforms need to set program ¯\_(ツ)_/¯
  gl.useProgram(program);
  uniforms.u_lightWorldPos.set([1, 8, -10]);
  uniforms.u_lightColor.set([1, 0.8, 0.8, 1]);
  uniforms.u_ambient.set([0, 0, 0, 1]);
  uniforms.u_specular.set([1, 1, 1, 1]);
  uniforms.u_shininess.set(50);
  uniforms.u_shininess.set(1);
  uniforms.u_specularFactor.set(1);
  uniforms.u_diffuse.set(0);
  uniforms.u_viewInverse.set(camera);

  gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0);
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, tex);

  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(attributes.a_position.location, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributes.a_position.location);

  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, normalBuffer);
  gl.vertexAttribPointer(attributes.a_normal.location, 3, GL_DATA_TYPE.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributes.a_normal.location);

  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, texcoordBuffer);
  gl.vertexAttribPointer(attributes.a_texcoord.location, 2, GL_DATA_TYPE.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributes.a_texcoord.location);

  gl.bindBuffer(GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, indicesBuffer);

  gl.drawElements(GL_STATIC_VARIABLES.TRIANGLES, 6 * 6, GL_STATIC_VARIABLES.UNSIGNED_SHORT, 0);

  const cameraObj = useCamera();
  let cameraType: ReturnType<typeof cameraObj.cameraType>;
  let resize: ReturnType<typeof cameraObj.resize>;
  createEffect(() => {
    cameraType = cameraObj.cameraType();
    resize = cameraObj.resize();

    if (cameraType === 'perspective') {
      const filmGauge = 35;
      const aspect = resize.width / resize.height;
      const filmHeight = filmGauge / Math.max(aspect, 1);
      const far = 2000;

      const near = 0.5;
      const fov = 50;
      const zoom = 1;
      let top = (near * Math.tan(DEG_TO_RAD * 0.5 * fov)) / zoom;
      let height = 2 * top;
      let width = aspect * height;
      let left = -0.5 * width;

      projection = m4.makePerspective(left, left + width, top - height, top, near, far, projection);
      projectionInverse = m4.inverse(projection, projectionInverse);
    } else {
      let zoom = 200;
      let left = -resize.width / (2 * zoom);
      let right = resize.width / (2 * zoom);
      let top = resize.height / (2 * zoom);
      let bottom = -resize.height / (2 * zoom);
      projection = m4.ortho(left, right, bottom, top, 0.5, 10, projection);
      projectionInverse = m4.inverse(projection, projectionInverse);
    }

    viewProjection = m4.multiply(projection, view, viewProjection);
  });

  // * render
  let id: number;
  function render(time: number) {
    time *= 0.001;

    canvas.width = resize.width;
    canvas.height = resize.height;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT | GL_CLEAR_MASK.DEPTH_BUFFER_BIT);

    world = m4.rotationY(time, world);

    gl.useProgram(program);
    uniforms.u_world.set(world);
    uniforms.u_worldInverseTranspose.set(m4.transpose(m4.inverse(world)));
    uniforms.u_worldViewProjection.set(m4.multiply(viewProjection, world));

    gl.drawElements(GL_STATIC_VARIABLES.TRIANGLES, 6 * 6, GL_STATIC_VARIABLES.UNSIGNED_SHORT, 0);

    id = requestAnimationFrame(render);
  }

  id = requestAnimationFrame(render);

  onCleanup(() => {
    cancelAnimationFrame(id);
  });

  return canvas;
}

function createProgram(gl: WebGL2RenderingContext | WebGLRenderingContext, vertexSrc: string, fragmentSrc: string) {
  const vertShader = compileShader(gl, GL_SHADER_TYPE.VERTEX_SHADER, vertexSrc);
  const fragShader = compileShader(gl, GL_SHADER_TYPE.FRAGMENT_SHADER, fragmentSrc);

  const program = linkProgram(gl, vertShader, fragShader);

  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  return program;
}
