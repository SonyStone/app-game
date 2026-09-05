import type { JSX } from '@solidjs/web';
import { createEffect, onCleanup, onSettled } from 'solid-js';
import type { ISceneCapture } from '../shared/capture/sceneCapture';
import { buildPreviewGeometry, createPreviewNormalization, type PreviewNormalization } from './mesh-preview';

type AvailableScene = Extract<ISceneCapture, { readonly status: 'available' }>;

/** Renders all reconstructed scene meshes in one shared world-space view with captured material textures. */
export function ScenePreview(props: {
  readonly scene: AvailableScene;
  readonly showGuides: boolean;
  readonly cameraResetRevision: number;
}): JSX.Element {
  let canvas!: HTMLCanvasElement;
  let renderer: SceneRenderer | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let drawFrame: number | undefined;
  let latestScene: AvailableScene | undefined;
  let yaw = INITIAL_YAW;
  let pitch = INITIAL_PITCH;
  let zoom = INITIAL_ZOOM;
  let pointer: { readonly id: number; readonly x: number; readonly y: number } | undefined;

  createEffect(
    () => props.scene,
    (scene) => {
      latestScene = scene;
      yaw = INITIAL_YAW;
      pitch = INITIAL_PITCH;
      zoom = INITIAL_ZOOM;
      renderer?.setScene(scene);
      requestDraw();
    }
  );

  createEffect(
    () => props.showGuides,
    () => requestDraw()
  );

  createEffect(
    () => props.cameraResetRevision,
    () => {
      yaw = INITIAL_YAW;
      pitch = INITIAL_PITCH;
      zoom = INITIAL_ZOOM;
      requestDraw();
    }
  );

  onSettled(() => {
    renderer = createSceneRenderer(canvas, requestDraw);
    if (latestScene) renderer?.setScene(latestScene);
    resizeObserver = new ResizeObserver(requestDraw);
    resizeObserver.observe(canvas);
    requestDraw();
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    if (drawFrame !== undefined) cancelAnimationFrame(drawFrame);
    renderer?.dispose();
  });

  function requestDraw(): void {
    if (drawFrame !== undefined) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = undefined;
      renderer?.draw(yaw, pitch, zoom, props.showGuides);
    });
  }

  function onPointerDown(event: PointerEvent): void {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw += (event.clientX - pointer.x) * 0.01;
    pitch = clamp(pitch + (event.clientY - pointer.y) * 0.01, -Math.PI / 2, Math.PI / 2);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    requestDraw();
  }

  function onPointerUp(event: PointerEvent): void {
    if (pointer?.id === event.pointerId) pointer = undefined;
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    zoom = clamp(zoom * Math.exp(-event.deltaY * 0.001), 0.2, 5);
    requestDraw();
  }

  return (
    <canvas
      ref={canvas}
      class="block h-full min-h-64 w-full cursor-grab touch-none active:cursor-grabbing"
      aria-label={`Combined preview of ${props.scene.meshes.length} meshes`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    />
  );
}

interface SceneRenderer {
  setScene(scene: AvailableScene): void;
  draw(yaw: number, pitch: number, zoom: number, showGuides: boolean): void;
  dispose(): void;
}

function createSceneRenderer(canvas: HTMLCanvasElement, invalidate: () => void): SceneRenderer | undefined {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true });
  if (!context) return undefined;
  const gl = context;
  const program = createProgram(gl);
  const uniforms = readUniforms(gl, program);
  let resources: SceneMeshResources[] = [];
  let guides: SceneGuideResources | undefined;
  let generation = 0;
  let sceneCenter = new Float32Array([0, 0, 0]);
  let sceneExtent = 1;

  return { setScene, draw, dispose };

  function setScene(scene: AvailableScene): void {
    generation++;
    deleteMeshResources(gl, resources);
    if (guides) deleteGuideResources(gl, guides);
    resources = [];
    const orientedMeshes = scene.meshes.map(({ mesh }) => orientMesh(mesh, scene.upAxis));
    const unalignedGeometries = orientedMeshes.map((mesh) => buildPreviewGeometry(mesh, RAW_POSITION_NORMALIZATION));
    const floorY = geometryFloorY(unalignedGeometries);
    const alignedMeshes = orientedMeshes.map((mesh) => moveMeshFloorToZero(mesh, floorY));
    const normalization = createPreviewNormalization(alignedMeshes);
    const geometries = unalignedGeometries.map((geometry) => moveGeometryFloorToZero(geometry, floorY));
    guides = createGuideResources(gl, normalization, 0);
    sceneCenter = Float32Array.from(normalization.center);
    sceneExtent = normalization.extent;
    scene.meshes.forEach((item, index) => {
      const geometry = geometries[index]!;
      const resource = createMeshResources(gl, geometry, item.mesh, index);
      resources.push(resource);
      if (item.texture?.src && item.mesh.uvs) {
        const imageGeneration = generation;
        void loadImage(item.texture.src)
          .then((image) => {
            if (imageGeneration !== generation) return;
            uploadImage(gl, resource.texture, image);
            resource.textured = true;
            invalidate();
          })
          .catch(() => undefined);
      }
    });
  }

  function draw(yaw: number, pitch: number, zoom: number, showGuides: boolean): void {
    resizeCanvas(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(21 / 255, 23 / 255, 25 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform3fv(uniforms.center, sceneCenter);
    gl.uniform1f(uniforms.extent, sceneExtent);
    gl.uniform2f(uniforms.rotation, yaw, pitch);
    gl.uniform1f(uniforms.zoom, zoom);
    gl.uniform1f(uniforms.aspect, canvas.width / canvas.height);
    gl.uniform1f(uniforms.pointSize, Math.max(7, window.devicePixelRatio * 5));
    gl.uniform1i(uniforms.texture, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (showGuides && guides) drawGrid(gl, uniforms, guides);

    for (const resource of resources) {
      gl.bindVertexArray(resource.vertexArray);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resource.texture);
      gl.uniform1i(uniforms.appearance, resource.textured ? 1 : 0);
      gl.uniform4fv(uniforms.color, resource.color);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resource.triangleBuffer);
      gl.drawElements(gl.TRIANGLES, resource.triangleCount, gl.UNSIGNED_INT, 0);
    }

    for (const resource of resources) {
      if (resource.textured || resource.edgeCount === 0) continue;
      gl.bindVertexArray(resource.vertexArray);
      gl.uniform1i(uniforms.appearance, 0);
      gl.uniform4f(uniforms.color, 105 / 255, 183 / 255, 1, 0.62);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resource.edgeBuffer);
      gl.drawElements(gl.LINES, resource.edgeCount, gl.UNSIGNED_INT, 0);
    }
    if (showGuides && guides) drawAxes(gl, uniforms, guides);
    gl.bindVertexArray(null);
  }

  function dispose(): void {
    generation++;
    deleteMeshResources(gl, resources);
    if (guides) deleteGuideResources(gl, guides);
    resources = [];
    guides = undefined;
    gl.deleteProgram(program);
  }
}

interface SceneUniforms {
  readonly center: WebGLUniformLocation;
  readonly extent: WebGLUniformLocation;
  readonly rotation: WebGLUniformLocation;
  readonly zoom: WebGLUniformLocation;
  readonly aspect: WebGLUniformLocation;
  readonly color: WebGLUniformLocation;
  readonly appearance: WebGLUniformLocation;
  readonly texture: WebGLUniformLocation;
  readonly pointSize: WebGLUniformLocation;
}

function readUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): SceneUniforms {
  return {
    center: requireResource(gl.getUniformLocation(program, 'u_center'), 'center uniform'),
    extent: requireResource(gl.getUniformLocation(program, 'u_extent'), 'extent uniform'),
    rotation: requireResource(gl.getUniformLocation(program, 'u_rotation'), 'rotation uniform'),
    zoom: requireResource(gl.getUniformLocation(program, 'u_zoom'), 'zoom uniform'),
    aspect: requireResource(gl.getUniformLocation(program, 'u_aspect'), 'aspect uniform'),
    color: requireResource(gl.getUniformLocation(program, 'u_color'), 'color uniform'),
    appearance: requireResource(gl.getUniformLocation(program, 'u_appearance'), 'appearance uniform'),
    texture: requireResource(gl.getUniformLocation(program, 'u_texture'), 'texture uniform'),
    pointSize: requireResource(gl.getUniformLocation(program, 'u_pointSize'), 'point-size uniform')
  };
}

interface SceneGuideResources {
  readonly vertexArray: WebGLVertexArrayObject;
  readonly positionBuffer: WebGLBuffer;
  readonly gridVertexCount: number;
  readonly xAxisOffset: number;
  readonly yAxisOffset: number;
  readonly zAxisOffset: number;
  readonly originOffset: number;
}

function createGuideResources(
  gl: WebGL2RenderingContext,
  normalization: PreviewNormalization,
  floorY: number
): SceneGuideResources {
  const geometry = createGuideGeometry(normalization, floorY);
  const vertexArray = requireResource(gl.createVertexArray(), 'guide vertex array');
  const positionBuffer = requireResource(gl.createBuffer(), 'guide position buffer');
  gl.bindVertexArray(vertexArray);
  uploadAttribute(gl, positionBuffer, 0, 3, geometry.positions);
  return { vertexArray, positionBuffer, ...geometry.ranges };
}

interface SceneGuideGeometry {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly ranges: Omit<SceneGuideResources, 'vertexArray' | 'positionBuffer'>;
}

/** Builds a floor grid and local axes around the robust center of the reconstructed scene. */
function createGuideGeometry(normalization: PreviewNormalization, floorY: number): SceneGuideGeometry {
  const halfExtent = normalization.extent * 0.6;
  const step = niceGridStep(halfExtent / GRID_DIVISIONS_PER_SIDE);
  const extent = Math.max(step, Math.ceil(halfExtent / step) * step);
  const lineCount = Math.ceil(extent / step);
  const values: number[] = [];
  const originX = normalization.center[0];
  const originY = floorY;
  const originZ = normalization.center[2];

  for (let line = -lineCount; line <= lineCount; line++) {
    const position = line * step;
    values.push(originX - extent, originY, originZ + position, originX + extent, originY, originZ + position);
    values.push(originX + position, originY, originZ - extent, originX + position, originY, originZ + extent);
  }

  const gridVertexCount = values.length / 3;
  const axisLength = Math.max(step, normalization.extent * AXIS_LENGTH_RATIO);
  const xAxisOffset = values.length / 3;
  values.push(originX, originY, originZ, originX + axisLength, originY, originZ);
  const yAxisOffset = values.length / 3;
  values.push(originX, originY, originZ, originX, originY + axisLength, originZ);
  const zAxisOffset = values.length / 3;
  values.push(originX, originY, originZ, originX, originY, originZ + axisLength);
  const originOffset = values.length / 3;
  values.push(originX, originY, originZ);

  return {
    positions: Float32Array.from(values),
    ranges: { gridVertexCount, xAxisOffset, yAxisOffset, zAxisOffset, originOffset }
  };
}

function geometryFloorY(geometries: readonly ReturnType<typeof buildPreviewGeometry>[]): number {
  const values: number[] = [];
  for (const geometry of geometries) {
    const referenced = geometry.triangles.length > 0 ? geometry.triangles : geometry.edges;
    const vertices = new Set(referenced);
    for (const vertex of vertices) {
      const value = geometry.positions[vertex * 3 + 1];
      if (value !== undefined && Number.isFinite(value)) values.push(value);
    }
  }
  if (values.length === 0) return 0;
  values.sort((left, right) => left - right);
  return values[Math.floor((values.length - 1) * FLOOR_QUANTILE)] ?? 0;
}

function niceGridStep(target: number): number {
  const safeTarget = Math.max(target, 1e-6);
  const magnitude = 10 ** Math.floor(Math.log10(safeTarget));
  const normalized = safeTarget / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function drawGrid(gl: WebGL2RenderingContext, uniforms: SceneUniforms, guides: SceneGuideResources): void {
  gl.bindVertexArray(guides.vertexArray);
  gl.uniform1i(uniforms.appearance, 0);
  gl.uniform4f(uniforms.color, 0.48, 0.52, 0.56, 0.28);
  gl.depthMask(false);
  gl.drawArrays(gl.LINES, 0, guides.gridVertexCount);
  gl.depthMask(true);
}

function drawAxes(gl: WebGL2RenderingContext, uniforms: SceneUniforms, guides: SceneGuideResources): void {
  gl.bindVertexArray(guides.vertexArray);
  gl.uniform1i(uniforms.appearance, 0);
  gl.depthMask(false);
  drawAxis(gl, uniforms, guides.xAxisOffset, [1, 0.25, 0.2, 1]);
  drawAxis(gl, uniforms, guides.yAxisOffset, [0.25, 0.9, 0.35, 1]);
  drawAxis(gl, uniforms, guides.zAxisOffset, [0.2, 0.55, 1, 1]);
  gl.uniform4f(uniforms.color, 1, 1, 1, 1);
  gl.drawArrays(gl.POINTS, guides.originOffset, 1);
  gl.depthMask(true);
}

function drawAxis(
  gl: WebGL2RenderingContext,
  uniforms: SceneUniforms,
  offset: number,
  color: readonly [number, number, number, number]
): void {
  gl.uniform4f(uniforms.color, color[0], color[1], color[2], color[3]);
  gl.drawArrays(gl.LINES, offset, 2);
}

function deleteGuideResources(gl: WebGL2RenderingContext, guides: SceneGuideResources): void {
  gl.deleteBuffer(guides.positionBuffer);
  gl.deleteVertexArray(guides.vertexArray);
}

interface SceneMeshResources {
  readonly vertexArray: WebGLVertexArrayObject;
  readonly positionBuffer: WebGLBuffer;
  readonly uvBuffer: WebGLBuffer;
  readonly triangleBuffer: WebGLBuffer;
  readonly edgeBuffer: WebGLBuffer;
  readonly texture: WebGLTexture;
  readonly triangleCount: number;
  readonly edgeCount: number;
  readonly color: Float32Array<ArrayBuffer>;
  textured: boolean;
}

type AvailableMesh = AvailableScene['meshes'][number]['mesh'];

function orientMesh(mesh: AvailableMesh, upAxis: AvailableScene['upAxis']): AvailableMesh {
  if (upAxis === 'y') return mesh;
  const positions = [...mesh.positions];
  for (let vertex = 0; vertex * mesh.dimensions < positions.length; vertex++) {
    const offset = vertex * mesh.dimensions;
    const y = positions[offset + 1] ?? 0;
    const z = positions[offset + 2] ?? 0;
    positions[offset + 1] = z;
    positions[offset + 2] = -y;
  }
  return { ...mesh, positions };
}

function moveMeshFloorToZero(mesh: AvailableMesh, floorY: number): AvailableMesh {
  const positions = [...mesh.positions];
  for (let vertex = 0; vertex * mesh.dimensions < positions.length; vertex++) {
    const offset = vertex * mesh.dimensions;
    positions[offset + 1] = (positions[offset + 1] ?? 0) - floorY;
  }
  return { ...mesh, positions };
}

function moveGeometryFloorToZero(
  geometry: ReturnType<typeof buildPreviewGeometry>,
  floorY: number
): ReturnType<typeof buildPreviewGeometry> {
  const positions = new Float32Array(geometry.positions);
  for (let offset = 1; offset < positions.length; offset += 3) positions[offset] = (positions[offset] ?? 0) - floorY;
  return { ...geometry, positions };
}

function createMeshResources(
  gl: WebGL2RenderingContext,
  geometry: ReturnType<typeof buildPreviewGeometry>,
  mesh: AvailableMesh,
  index: number
): SceneMeshResources {
  const vertexArray = requireResource(gl.createVertexArray(), 'vertex array');
  const positionBuffer = requireResource(gl.createBuffer(), 'position buffer');
  const uvBuffer = requireResource(gl.createBuffer(), 'UV buffer');
  const triangleBuffer = requireResource(gl.createBuffer(), 'triangle buffer');
  const edgeBuffer = requireResource(gl.createBuffer(), 'edge buffer');
  const texture = requireResource(gl.createTexture(), 'texture');
  gl.bindVertexArray(vertexArray);
  uploadAttribute(gl, positionBuffer, 0, 3, geometry.positions);
  uploadAttribute(gl, uvBuffer, 1, 2, createUvValues(mesh.uvs, geometry.positions.length / 3));
  uploadIndices(gl, triangleBuffer, geometry.triangles);
  uploadIndices(gl, edgeBuffer, geometry.edges);
  initializeTexture(gl, texture, gl.REPEAT);
  return {
    vertexArray,
    positionBuffer,
    uvBuffer,
    triangleBuffer,
    edgeBuffer,
    texture,
    triangleCount: geometry.triangles.length,
    edgeCount: geometry.edges.length,
    color: meshColor(index),
    textured: false
  };
}

function uploadAttribute(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  location: number,
  dimensions: number,
  values: Float32Array<ArrayBuffer>
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, dimensions, gl.FLOAT, false, 0, 0);
}

function uploadIndices(gl: WebGL2RenderingContext, buffer: WebGLBuffer, values: Uint32Array<ArrayBuffer>): void {
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, values, gl.STATIC_DRAW);
}

function createUvValues(uvs: AvailableMesh['uvs'], vertexCount: number): Float32Array<ArrayBuffer> {
  const values = new Float32Array(vertexCount * 2);
  if (!uvs) return values;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    values[vertex * 2] = uvs.values[vertex * uvs.dimensions] ?? 0;
    values[vertex * 2 + 1] = uvs.values[vertex * uvs.dimensions + 1] ?? 0;
  }
  return values;
}

function initializeTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, wrap: number): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
}

function uploadImage(gl: WebGL2RenderingContext, texture: WebGLTexture, image: HTMLImageElement): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode a captured scene texture.'));
    image.src = source;
  });
}

function deleteMeshResources(gl: WebGL2RenderingContext, resources: readonly SceneMeshResources[]): void {
  for (const resource of resources) {
    gl.deleteTexture(resource.texture);
    gl.deleteBuffer(resource.edgeBuffer);
    gl.deleteBuffer(resource.triangleBuffer);
    gl.deleteBuffer(resource.uvBuffer);
    gl.deleteBuffer(resource.positionBuffer);
    gl.deleteVertexArray(resource.vertexArray);
  }
}

function meshColor(index: number): Float32Array<ArrayBuffer> {
  const hue = (index * 0.61803398875) % 1;
  const channel = (offset: number) => 0.42 + 0.36 * Math.cos((hue + offset) * Math.PI * 2);
  return new Float32Array([channel(0), channel(1 / 3), channel(2 / 3), 0.82]);
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = requireResource(gl.createProgram(), 'program');
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Unable to link scene-preview shaders.');
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireResource(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unable to compile a scene-preview shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function requireResource<T>(resource: T | null, name: string): T {
  if (!resource) throw new Error(`Unable to create scene preview ${name}.`);
  return resource;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;
uniform vec3 u_center;
uniform float u_extent;
uniform vec2 u_rotation;
uniform float u_zoom;
uniform float u_aspect;
uniform float u_pointSize;
out vec2 v_uv;

void main() {
  float cy = cos(u_rotation.x);
  float sy = sin(u_rotation.x);
  float cp = cos(u_rotation.y);
  float sp = sin(u_rotation.y);
  vec3 centered = (a_position - u_center) * (2.0 / max(u_extent, 0.000001));
  vec3 yawed = vec3(centered.x * cy - centered.z * sy, centered.y, centered.x * sy + centered.z * cy);
  vec3 rotated = vec3(yawed.x, yawed.y * cp - yawed.z * sp, yawed.z * cp + yawed.y * sp);
  vec3 scaled = rotated * u_zoom;
  float viewZ = scaled.z - 4.0;
  float focalLength = 2.41421356237;
  float nearPlane = 0.01;
  float farPlane = 100.0;
  gl_Position = vec4(
    scaled.x * focalLength / max(u_aspect, 0.000001),
    scaled.y * focalLength,
    ((farPlane + nearPlane) / (nearPlane - farPlane)) * viewZ
      + (2.0 * farPlane * nearPlane) / (nearPlane - farPlane),
    -viewZ
  );
  gl_PointSize = u_pointSize;
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_color;
uniform int u_appearance;
in vec2 v_uv;
out vec4 outputColor;
void main() {
  if (u_appearance == 1) outputColor = vec4(texture(u_texture, v_uv).rgb, 1.0);
  else outputColor = u_color;
}`;

const RAW_POSITION_NORMALIZATION = { center: [0, 0, 0], extent: 2 } as const;
const INITIAL_YAW = -0.55;
const INITIAL_PITCH = 0.35;
const INITIAL_ZOOM = 0.9;
const GRID_DIVISIONS_PER_SIDE = 10;
const AXIS_LENGTH_RATIO = 0.35;
const FLOOR_QUANTILE = 0.01;
