import type { DemoDefinition } from './types';

export const demos: readonly DemoDefinition[] = [
  {
    id: 'monolith',
    title: 'Monolith Shader',
    source: 'custom playground scene',
    summary:
      'Existing custom shader demo for baseline wrapper behavior: reactive uniforms, transforms, and mesh composition.',
    features: ['Mesh + Box', 'custom Program uniforms', 'reactive transforms'],
    clearColor: [0.03, 0.03, 0.04, 1],
  },
  {
    id: 'primitives',
    title: 'Base Primitives',
    source: 'ogl/examples/base-primitives.html',
    summary:
      'Plane, Sphere, Box, and Cylinder using wrapper components plus a camera driven by the Orbit helper.',
    features: [
      'Plane / Sphere / Box / Cylinder',
      'custom lighting shader',
      'Camera + Orbit',
    ],
    clearColor: [0.97, 0.97, 0.96, 1],
  },
  {
    id: 'helpers',
    title: 'Helpers',
    source: 'ogl/examples/helpers.html',
    summary:
      'Axes, grid, and normal helpers mounted through wrapper components to test object-dependent constructors.',
    features: [
      'AxesHelper + GridHelper',
      'VertexNormalsHelper',
      'FaceNormalsHelper',
    ],
    clearColor: [0.985, 0.985, 0.98, 1],
  },
  {
    id: 'scene-graph',
    title: 'Scene Graph',
    source: 'ogl/examples/scene-graph.html',
    summary:
      'Nested transforms and inherited rotations rendered as a deterministic hierarchy of box and sphere branches.',
    features: [
      'deep Transform nesting',
      'recursive hierarchy',
      'animated inheritance',
    ],
    clearColor: [0.98, 0.97, 0.96, 1],
  },
  {
    id: 'particles',
    title: 'Particles',
    source: 'ogl/examples/particles.html',
    summary:
      'Custom geometry attributes and a point cloud shader to exercise non-primitive geometry and per-frame uniforms.',
    features: ['custom Geometry attributes', 'POINTS mode', 'shader animation'],
    clearColor: [0.99, 0.99, 0.99, 1],
  },
  {
    id: 'draw-modes',
    title: 'Draw Modes',
    source: 'ogl/examples/draw-modes.html',
    summary:
      'One indexed square rendered four ways to stress mode switching while keeping geometry and shader setup declarative.',
    features: [
      'shared Geometry',
      'POINTS / LINES / LOOP / TRIANGLES',
      'shared Program',
    ],
    clearColor: [0.985, 0.985, 0.985, 1],
  },
  {
    id: 'instancing',
    title: 'Instancing',
    source: 'ogl/examples/instancing.html',
    summary:
      'A declarative instanced mesh that mutates a shared box geometry with per-instance offset and random attributes.',
    features: [
      'InstancedMesh',
      'instanced attributes',
      'animated vertex transforms',
    ],
    clearColor: [0.99, 0.99, 0.985, 1],
  },
  {
    id: 'polylines',
    title: 'Polylines',
    source: 'ogl/examples/polylines.html',
    summary:
      'Animated screen-style ribbon lines driven by the Polyline helper to test non-mesh declarative attachment.',
    features: ['Polyline', 'dynamic point updates', 'multiple line instances'],
    clearColor: [0.97, 0.97, 0.965, 1],
  },
  {
    id: 'render-to-texture',
    title: 'Render To Texture',
    source: 'ogl/examples/render-to-texture.html',
    summary:
      'An offscreen box rendered into a framebuffer texture, then reused on a visible mesh in the main scene.',
    features: [
      'RenderTarget',
      'Texture resource nodes',
      'manual offscreen pass',
    ],
    clearColor: [0.97, 0.97, 0.98, 1],
  },
];
