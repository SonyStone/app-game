export type Rgb = readonly [number, number, number];

export type CameraSceneProps = {
  makeDefault?: boolean;
};

export type MonolithProgramLike = {
  uniforms: {
    uTime: { value: number };
    uColorA: { value: Rgb };
    uColorB: { value: Rgb };
  };
};

export type ParticleProgramLike = {
  uniforms: {
    uTime: { value: number };
  };
};

export type OrbitLike = {
  update: () => void;
  remove: () => void;
};

export type DemoId =
  | 'monolith'
  | 'primitives'
  | 'helpers'
  | 'scene-graph'
  | 'particles'
  | 'draw-modes'
  | 'instancing'
  | 'polylines'
  | 'render-to-texture';

export type DemoDefinition = {
  id: DemoId;
  title: string;
  source: string;
  summary: string;
  features: readonly string[];
  clearColor: readonly [number, number, number, number?];
};
