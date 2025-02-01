import { rgbToGL } from '@packages/chroma/io/gl';
import { hsv2rgb } from '@packages/chroma/io/hsv/hsv2rgb';
import CaptureMenu from '@packages/spector/embedded-frontend-2/capture-menu';
import { Spector } from '@packages/spector/spector';
import * as twgl from '@packages/twgl';
import { Title } from '@solidjs/meta';
import { onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import fs from './shader.frag?raw';
import vs from './shader.vert?raw';

export default function UniformBufferObjects() {
  const canvas = (<canvas class="h-full w-full" />) as HTMLCanvasElement;

  const m4 = twgl.m4;
  twgl.setDefaults({ attribPrefix: 'a_' });
  const gl = canvas.getContext('webgl2')!;
  if (!twgl.isWebGL2(gl)) {
    alert('This example requires WebGL 2.0'); // eslint-disable-line
    return;
  }

  const programInfo = twgl.createProgramInfo(gl, [vs, fs] as const);

  const bufferInfo = twgl.primitives.createCubeBufferInfo(gl, 2);

  const tex = twgl.createTexture(gl, {
    min: gl.NEAREST,
    mag: gl.NEAREST,
    src: [255, 255, 255, 255, 192, 192, 192, 255, 192, 192, 192, 255, 255, 255, 255, 255]
  });

  function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  function randElement<T>(array: T[]) {
    return array[rand(0, array.length) | 0];
  }

  const uniforms: { [key: string]: any } = {
    u_diffuse: tex
  };

  // We pull out the Float32Array views for viewProjection and viewInverse (and world below)
  // from the viewUboInfo but, if we're modifying the shaders it's possible they might
  // get optimized away. So, the `|| Float32Array` basically just makes a dummy in that case
  // so the rest of the code doesn't have to check for existence.

  const viewUboInfo = twgl.createUniformBlockInfo(gl, programInfo, 'View');
  const viewProjection = viewUboInfo.uniforms.u_viewProjection || new Float32Array(16);
  const viewInverse = viewUboInfo.uniforms.u_viewInverse || new Float32Array(16);

  const lightUboInfos = [];
  for (let ii = 0; ii < 10; ++ii) {
    const lightUbo = twgl.createUniformBlockInfo(gl, programInfo, 'Lights[0]');
    twgl.setBlockUniforms(lightUbo, {
      u_lightColor: rgbToGL(hsv2rgb(rand(0, 360), 0.6, 0.8)),
      u_lightWorldPos: [rand(-100, 100), rand(-100, 100), rand(-100, 100)]
    });
    twgl.setUniformBlock(gl, programInfo, lightUbo);
    lightUboInfos.push(lightUbo);
  }

  const materialUboInfos = [];
  for (let ii = 0; ii < 4; ++ii) {
    const materialUbo = twgl.createUniformBlockInfo(gl, programInfo, 'Material');
    twgl.setBlockUniforms(materialUbo, {
      u_ambient: [0, 0, 0, 1],
      u_specular: rgbToGL(hsv2rgb(rand(0, 360), 1, 0.5)),
      u_shininess: rand(25, 250),
      u_specularFactor: rand(0.5, 1)
    });
    twgl.setUniformBlock(gl, programInfo, materialUbo);

    materialUboInfos.push(materialUbo);
  }

  const objects: any[] = [];
  for (let ii = 0; ii < 300; ++ii) {
    const modelUbo = twgl.createUniformBlockInfo(gl, programInfo, 'Model');
    const world = m4.rotateY(
      m4.rotateX(m4.translation([rand(-30, 30), rand(-30, 30), rand(-30, 30)]), rand(0, Math.PI * 2)),
      rand(0, Math.PI)
    );

    twgl.setBlockUniforms(modelUbo, {
      u_world: world,
      u_worldInverseTranspose: m4.transpose(m4.inverse(world))
    });
    twgl.setUniformBlock(gl, programInfo, modelUbo);

    const o = {
      modelUboInfo: modelUbo,
      materialUboInfo: randElement(materialUboInfos),
      lightUboInfo: randElement(lightUboInfos),
      world: modelUbo.uniforms.u_world || new Float32Array(16) // See above
    };
    objects.push(o);
  }

  let id = 0;
  function render(time: number) {
    time *= 0.001;
    twgl.resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const projection = m4.perspective((30 * Math.PI) / 180, canvas.clientWidth / canvas.clientHeight, 0.5, 250);
    const radius = 70;
    const eye = [Math.sin(time) * radius, Math.sin(time * 0.3) * radius * 0.6, Math.cos(time) * radius];
    const target = [0, 0, 0];
    const up = [0, 1, 0];

    const camera = m4.lookAt(eye, target, up, viewInverse);
    const view = m4.inverse(camera);
    m4.multiply(projection, view, viewProjection);

    gl.useProgram(programInfo!.program);
    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
    twgl.setUniforms(programInfo, uniforms);
    twgl.setUniformBlock(gl, programInfo, viewUboInfo);

    objects.forEach(function (o) {
      twgl.bindUniformBlock(gl, programInfo, o.lightUboInfo);
      twgl.bindUniformBlock(gl, programInfo, o.materialUboInfo);
      twgl.bindUniformBlock(gl, programInfo, o.modelUboInfo);

      twgl.drawBufferInfo(gl, bufferInfo);
    });

    id = requestAnimationFrame(render);
  }

  onMount(() => {
    id = requestAnimationFrame(render);
    const spector = new Spector();
    spector.displayUI();
  });

  onCleanup(() => {
    cancelAnimationFrame(id);
  });

  return (
    <>
      <Title>Uniform Buffer Objects</Title>
      <Portal>
        <CaptureMenu />
      </Portal>
      {canvas}
    </>
  );
}
