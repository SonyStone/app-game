import type { JSX } from '@solidjs/web';
import { createEffect, onCleanup, onSettled } from 'solid-js';
import type { IMeshCapture } from '../shared/capture/meshCapture';

type AvailableMesh = Extract<IMeshCapture, { readonly status: 'available' }>;

/** Renders a draggable GPU-backed object-space preview without replaying the captured shader. */
export function MeshPreview(props: { readonly mesh: AvailableMesh }): JSX.Element {
  let canvas!: HTMLCanvasElement;
  let renderer: MeshRenderer | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let drawFrame: number | undefined;
  let latestMesh: AvailableMesh | undefined;
  let yaw = -0.55;
  let pitch = 0.35;
  let zoom = 0.9;
  let pointer: { readonly id: number; readonly x: number; readonly y: number } | undefined;

  createEffect(
    () => props.mesh,
    (mesh) => {
      latestMesh = mesh;
      if (!renderer) return;
      renderer.setMesh(mesh);
      requestDraw();
    }
  );

  onSettled(() => {
    renderer = createMeshRenderer(canvas);
    if (latestMesh) renderer?.setMesh(latestMesh);
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
      renderer?.draw(yaw, pitch, zoom);
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
      aria-label={`Wireframe preview using ${
        props.mesh.positionSource === 'vertex-shader' ? 'replayed vertex shader output' : props.mesh.positionAttribute
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    />
  );
}

interface MeshRenderer {
  setMesh(mesh: AvailableMesh): void;
  draw(yaw: number, pitch: number, zoom: number): void;
  dispose(): void;
}

function createMeshRenderer(canvas: HTMLCanvasElement): MeshRenderer | undefined {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
    preserveDrawingBuffer: false
  });
  if (!context) return undefined;
  const gl = context;

  const program = createProgram(gl);
  const vertexArray = requireResource(gl.createVertexArray(), 'vertex array');
  const positionBuffer = requireResource(gl.createBuffer(), 'position buffer');
  const triangleBuffer = requireResource(gl.createBuffer(), 'triangle buffer');
  const edgeBuffer = requireResource(gl.createBuffer(), 'edge buffer');
  const pointBuffer = requireResource(gl.createBuffer(), 'point buffer');
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const rotationLocation = requireResource(gl.getUniformLocation(program, 'u_rotation'), 'rotation uniform');
  const zoomLocation = requireResource(gl.getUniformLocation(program, 'u_zoom'), 'zoom uniform');
  const aspectLocation = requireResource(gl.getUniformLocation(program, 'u_aspect'), 'aspect uniform');
  const colorLocation = requireResource(gl.getUniformLocation(program, 'u_color'), 'color uniform');
  const pointSizeLocation = requireResource(gl.getUniformLocation(program, 'u_pointSize'), 'point-size uniform');
  let triangleCount = 0;
  let edgeCount = 0;
  let pointCount = 0;

  if (positionLocation < 0) throw new Error('Mesh preview shader does not expose its position attribute.');

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return { setMesh, draw, dispose };

  function setMesh(mesh: AvailableMesh): void {
    const geometry = buildPreviewGeometry(mesh);
    triangleCount = geometry.triangles.length;
    edgeCount = geometry.edges.length;
    pointCount = geometry.points.length;

    gl.bindVertexArray(vertexArray);
    uploadBuffer(gl, gl.ARRAY_BUFFER, positionBuffer, geometry.positions);
    uploadBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, triangleBuffer, geometry.triangles);
    uploadBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, edgeBuffer, geometry.edges);
    uploadBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, pointBuffer, geometry.points);
    gl.bindVertexArray(null);
  }

  function draw(yaw: number, pitch: number, zoom: number): void {
    resizeCanvas(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(21 / 255, 23 / 255, 25 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.uniform2f(rotationLocation, yaw, pitch);
    gl.uniform1f(zoomLocation, zoom);
    gl.uniform1f(aspectLocation, canvas.height / canvas.width);
    gl.uniform1f(pointSizeLocation, Math.max(2, window.devicePixelRatio * 1.5));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (triangleCount > 0) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.uniform4f(colorLocation, 41 / 255, 126 / 255, 184 / 255, 0.34);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
      gl.drawElements(gl.TRIANGLES, triangleCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    if (edgeCount > 0) {
      gl.uniform4f(colorLocation, 105 / 255, 183 / 255, 1, 0.86);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer);
      gl.drawElements(gl.LINES, edgeCount, gl.UNSIGNED_INT, 0);
    } else if (pointCount > 0) {
      gl.uniform4f(colorLocation, 105 / 255, 183 / 255, 1, 0.9);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pointBuffer);
      gl.drawElements(gl.POINTS, pointCount, gl.UNSIGNED_INT, 0);
    }

    gl.bindVertexArray(null);
  }

  function dispose(): void {
    gl.deleteBuffer(pointBuffer);
    gl.deleteBuffer(edgeBuffer);
    gl.deleteBuffer(triangleBuffer);
    gl.deleteBuffer(positionBuffer);
    gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
  }
}

/** Geometry normalized and filtered once for efficient interactive rendering. */
export interface PreviewGeometry {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly triangles: Uint32Array<ArrayBuffer>;
  readonly edges: Uint32Array<ArrayBuffer>;
  readonly points: Uint32Array<ArrayBuffer>;
}

/** Shared center and scale used to keep several captured meshes in one coordinate system. */
export interface PreviewNormalization {
  readonly center: readonly [number, number, number];
  readonly extent: number;
}

/** Builds preview topology while rejecting degenerate and anomalously long strip connectors. */
export function buildPreviewGeometry(
  mesh: AvailableMesh,
  normalization = createPreviewNormalization([mesh])
): PreviewGeometry {
  const positions = normalizePositions(mesh.positions, mesh.dimensions, normalization);
  const vertexCount = positions.length / 3;
  const elements = mesh.indices ?? Array.from({ length: vertexCount }, (_, index) => index);

  if (mesh.mode >= 4 && mesh.mode <= 6) {
    return buildTriangleGeometry(positions, elements, mesh.mode, vertexCount);
  }

  if (mesh.mode >= 1 && mesh.mode <= 3) {
    const candidates: EdgeCandidate[] = [];
    visitWireframeSegments(elements, mesh.mode, (left, right) => {
      if (left >= vertexCount || right >= vertexCount) return;
      candidates.push({ left, right, lengthSquared: edgeLengthSquared(positions, left, right) });
    });
    const threshold = outlierThreshold(candidates.map(({ lengthSquared }) => lengthSquared));
    return {
      positions,
      triangles: EMPTY_INDICES,
      edges: Uint32Array.from(
        candidates.filter(({ lengthSquared }) => lengthSquared <= threshold).flatMap(({ left, right }) => [left, right])
      ),
      points: EMPTY_INDICES
    };
  }

  const points = elements.slice(0, MAX_PREVIEW_POINTS).filter((index) => index >= 0 && index < vertexCount);
  return { positions, triangles: EMPTY_INDICES, edges: EMPTY_INDICES, points: Uint32Array.from(points) };
}

/** Computes robust shared bounds for one or more meshes without merging their vertex arrays. */
export function createPreviewNormalization(meshes: readonly AvailableMesh[]): PreviewNormalization {
  const axes = [[], [], []] as [number[], number[], number[]];
  const perMeshBudget = Math.max(1, Math.floor(MAX_NORMALIZATION_SAMPLES / Math.max(1, meshes.length)));
  for (const mesh of meshes) {
    const vertexCount = Math.floor(mesh.positions.length / mesh.dimensions);
    const step = Math.max(1, Math.ceil(vertexCount / perMeshBudget));
    for (let vertex = 0; vertex < vertexCount; vertex += step) {
      for (let axis = 0; axis < 3; axis++) {
        axes[axis].push(axis < mesh.dimensions ? (mesh.positions[vertex * mesh.dimensions + axis] ?? 0) : 0);
      }
    }
  }
  const lower = axes.map((axis) => quantile(axis, BOUNDS_LOWER_QUANTILE));
  const upper = axes.map((axis) => quantile(axis, BOUNDS_UPPER_QUANTILE));
  return {
    center: lower.map((value, axis) => (value + upper[axis]!) / 2) as [number, number, number],
    extent: Math.max(...lower.map((value, axis) => upper[axis]! - value), 1e-6)
  };
}

interface TriangleCandidate {
  readonly left: number;
  readonly middle: number;
  readonly right: number;
  readonly maximumEdgeSquared: number;
}

function buildTriangleGeometry(
  positions: Float32Array<ArrayBuffer>,
  elements: readonly number[],
  mode: number,
  vertexCount: number
): PreviewGeometry {
  const candidates: TriangleCandidate[] = [];
  visitTriangles(elements, mode, (left, middle, right) => {
    if (left >= vertexCount || middle >= vertexCount || right >= vertexCount) return;
    const metrics = triangleMetrics(positions, left, middle, right);
    if (metrics.areaSquared <= metrics.maximumEdgeSquared * SPATIAL_DEGENERATE_RATIO) return;
    candidates.push({ left, middle, right, maximumEdgeSquared: metrics.maximumEdgeSquared });
  });

  const threshold = outlierThreshold(candidates.map(({ maximumEdgeSquared }) => maximumEdgeSquared));
  const triangles: number[] = [];
  const edges: number[] = [];
  const visitedEdges = new Set<number>();

  for (const candidate of candidates) {
    if (candidate.maximumEdgeSquared > threshold) continue;
    triangles.push(candidate.left, candidate.middle, candidate.right);
    addUniqueEdge(candidate.left, candidate.middle);
    addUniqueEdge(candidate.middle, candidate.right);
    addUniqueEdge(candidate.right, candidate.left);
  }

  return {
    positions,
    triangles: Uint32Array.from(triangles),
    edges: Uint32Array.from(edges),
    points: EMPTY_INDICES
  };

  function addUniqueEdge(left: number, right: number): void {
    if (visitedEdges.size >= MAX_PREVIEW_SEGMENTS) return;
    const minimum = Math.min(left, right);
    const maximum = Math.max(left, right);
    const key = minimum * vertexCount + maximum;
    if (visitedEdges.has(key)) return;
    visitedEdges.add(key);
    edges.push(minimum, maximum);
  }
}

interface EdgeCandidate {
  readonly left: number;
  readonly right: number;
  readonly lengthSquared: number;
}

function normalizePositions(
  values: readonly number[],
  dimensions: number,
  normalization: PreviewNormalization
): Float32Array<ArrayBuffer> {
  const vertexCount = Math.floor(values.length / dimensions);
  const normalized = new Float32Array(vertexCount * 3);

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = axis < dimensions ? (values[vertex * dimensions + axis] ?? 0) : 0;
      normalized[vertex * 3 + axis] = ((value - normalization.center[axis]) * 2) / normalization.extent;
    }
  }
  return normalized;
}

function triangleMetrics(positions: Float32Array<ArrayBuffer>, left: number, middle: number, right: number) {
  const leftMiddle = vectorBetween(positions, left, middle);
  const leftRight = vectorBetween(positions, left, right);
  const middleRight = vectorBetween(positions, middle, right);
  const crossX = leftMiddle[1] * leftRight[2] - leftMiddle[2] * leftRight[1];
  const crossY = leftMiddle[2] * leftRight[0] - leftMiddle[0] * leftRight[2];
  const crossZ = leftMiddle[0] * leftRight[1] - leftMiddle[1] * leftRight[0];
  return {
    areaSquared: crossX * crossX + crossY * crossY + crossZ * crossZ,
    maximumEdgeSquared: Math.max(
      vectorLengthSquared(leftMiddle),
      vectorLengthSquared(leftRight),
      vectorLengthSquared(middleRight)
    )
  };
}

function edgeLengthSquared(positions: Float32Array<ArrayBuffer>, left: number, right: number): number {
  return vectorLengthSquared(vectorBetween(positions, left, right));
}

function vectorBetween(positions: Float32Array<ArrayBuffer>, left: number, right: number): [number, number, number] {
  return [
    (positions[right * 3] ?? 0) - (positions[left * 3] ?? 0),
    (positions[right * 3 + 1] ?? 0) - (positions[left * 3 + 1] ?? 0),
    (positions[right * 3 + 2] ?? 0) - (positions[left * 3 + 2] ?? 0)
  ];
}

function vectorLengthSquared(vector: readonly number[]): number {
  return vector.reduce((sum, value) => sum + value * value, 0);
}

function outlierThreshold(values: readonly number[]): number {
  if (values.length === 0) return Infinity;
  return quantile(values, EDGE_LENGTH_QUANTILE) * EDGE_LENGTH_OUTLIER_FACTOR;
}

function quantile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
}

function visitTriangles(
  elements: readonly number[],
  mode: number,
  visit: (leftIndex: number, middleIndex: number, rightIndex: number) => void
): void {
  const read = (index: number) => elements[index] ?? -1;
  const triangle = (left: number, middle: number, right: number) => {
    if (left < 0 || middle < 0 || right < 0 || left === middle || middle === right || right === left) return;
    visit(left, middle, right);
  };

  if (mode === 4) {
    for (let index = 0; index + 2 < elements.length; index += 3) {
      triangle(read(index), read(index + 1), read(index + 2));
    }
  } else if (mode === 5) {
    for (let index = 0; index + 2 < elements.length; index++) {
      triangle(read(index), read(index + 1), read(index + 2));
    }
  } else if (mode === 6) {
    for (let index = 1; index + 1 < elements.length; index++) {
      triangle(read(0), read(index), read(index + 1));
    }
  }
}

/** Visits unique, non-degenerate wireframe edges across the complete captured draw. */
export function visitWireframeSegments(
  elements: readonly number[],
  mode: number,
  visit: (leftIndex: number, rightIndex: number) => void,
  limit = MAX_PREVIEW_SEGMENTS
): number {
  const visited = new Set<string>();
  const read = (index: number) => elements[index] ?? -1;

  function edge(left: number, right: number): void {
    if (visited.size >= limit || left < 0 || right < 0 || left === right) return;
    const key = left < right ? `${left}:${right}` : `${right}:${left}`;
    if (visited.has(key)) return;
    visited.add(key);
    visit(left, right);
  }

  function triangle(left: number, middle: number, right: number): void {
    if (left < 0 || middle < 0 || right < 0 || left === middle || middle === right || right === left) return;
    edge(left, middle);
    edge(middle, right);
    edge(right, left);
  }

  if (mode === 1) {
    for (let index = 0; index + 1 < elements.length && visited.size < limit; index += 2) {
      edge(read(index), read(index + 1));
    }
  } else if (mode === 2 || mode === 3) {
    for (let index = 0; index + 1 < elements.length && visited.size < limit; index++) {
      edge(read(index), read(index + 1));
    }
    if (mode === 2 && elements.length > 2) edge(read(elements.length - 1), read(0));
  } else if (mode === 4) {
    for (let index = 0; index + 2 < elements.length && visited.size < limit; index += 3) {
      triangle(read(index), read(index + 1), read(index + 2));
    }
  } else if (mode === 5) {
    for (let index = 0; index + 2 < elements.length && visited.size < limit; index++) {
      triangle(read(index), read(index + 1), read(index + 2));
    }
  } else if (mode === 6) {
    for (let index = 1; index + 1 < elements.length && visited.size < limit; index++) {
      triangle(read(0), read(index), read(index + 1));
    }
  }

  return visited.size;
}

function uploadBuffer(
  gl: WebGL2RenderingContext,
  target: typeof gl.ARRAY_BUFFER | typeof gl.ELEMENT_ARRAY_BUFFER,
  buffer: WebGLBuffer,
  data: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>
): void {
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  const program = requireResource(gl.createProgram(), 'shader program');
  try {
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Unable to link mesh preview shader.');
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireResource(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unable to compile mesh preview shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function requireResource<T>(resource: T | null, name: string): T {
  if (!resource) throw new Error(`Unable to create mesh preview ${name}.`);
  return resource;
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec3 a_position;
uniform vec2 u_rotation;
uniform float u_zoom;
uniform float u_aspect;
uniform float u_pointSize;

void main() {
  float cosineYaw = cos(u_rotation.x);
  float sineYaw = sin(u_rotation.x);
  float cosinePitch = cos(u_rotation.y);
  float sinePitch = sin(u_rotation.y);
  vec3 yawed = vec3(
    a_position.x * cosineYaw - a_position.z * sineYaw,
    a_position.y,
    a_position.x * sineYaw + a_position.z * cosineYaw
  );
  vec3 rotated = vec3(
    yawed.x,
    yawed.y * cosinePitch - yawed.z * sinePitch,
    yawed.z * cosinePitch + yawed.y * sinePitch
  );
  float perspective = 2.4 / max(1.0, 3.0 + rotated.z);
  gl_Position = vec4(
    rotated.x * perspective * u_zoom * u_aspect,
    rotated.y * perspective * u_zoom,
    rotated.z * 0.1,
    1.0
  );
  gl_PointSize = u_pointSize;
}`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outputColor;

void main() {
  outputColor = u_color;
}`;

const EMPTY_INDICES = new Uint32Array();
const BOUNDS_LOWER_QUANTILE = 0.001;
const BOUNDS_UPPER_QUANTILE = 0.999;
const EDGE_LENGTH_QUANTILE = 0.99;
const EDGE_LENGTH_OUTLIER_FACTOR = 16;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_NORMALIZATION_SAMPLES = 120_000;
const MAX_PREVIEW_POINTS = 120_000;
const MAX_PREVIEW_SEGMENTS = 120_000;
const SPATIAL_DEGENERATE_RATIO = 1e-12;
