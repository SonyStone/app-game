import { Camera, Renderer, type Transform } from 'ogl';
import type { Accessor, JSX } from 'solid-js';
import type { Canvas } from './canvas';

export type AnyInstance = Record<string, unknown>;
export type OglConstructor<T = unknown> = new (...args: any[]) => T;

type SetterArgument<T> = T extends {
  set: (value: infer TValue, ...args: any[]) => unknown;
}
  ? TValue
  : never;

type ReservedOglPropKeys =
  | 'args'
  | 'attach'
  | 'children'
  | 'makeDefault'
  | 'ref';

type AssignableProp<T> = T extends { set: (...args: any[]) => unknown }
  ? T | SetterArgument<T> | readonly number[]
  : T;

type OglInstanceProps<TInstance> = Partial<{
  [K in keyof TInstance as K extends ReservedOglPropKeys
    ? never
    : TInstance[K] extends (...args: any[]) => unknown
      ? never
      : K]: AssignableProp<TInstance[K]>;
}>;

type OglLookAtProp<TInstance> = TInstance extends {
  lookAt: (...args: infer TArgs) => unknown;
}
  ? TArgs extends [infer TTarget, ...any[]]
    ? { lookAt?: TTarget }
    : {}
  : {};

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type OglBaseProps<
  TInstance = unknown,
  TArgs extends readonly unknown[] = readonly unknown[],
> = {
  args?: TArgs | readonly unknown[];
  attach?: string;
  makeDefault?: boolean;
  ref?: (instance: TInstance) => void;
  children?: JSX.Element;
};

export type OglElementProps<
  TInstance = unknown,
  TArgs extends readonly unknown[] = readonly unknown[],
  TConstructorProps extends object = {},
> = Simplify<
  OglBaseProps<TInstance, TArgs> &
    Partial<Omit<TConstructorProps, ReservedOglPropKeys>> &
    OglInstanceProps<TInstance> &
    OglLookAtProp<TInstance>
>;

export type OglRuntimeProps = OglBaseProps<unknown> & Record<string, unknown>;
export type OglAttachProps<TInstance = unknown> = Pick<
  OglBaseProps<TInstance>,
  'attach' | 'ref'
>;

export type ConstructorRegistration = {
  constructor: OglConstructor;
  requiresGl?: boolean;
};

export type RegisteredConstructors = Record<
  string,
  OglConstructor | ConstructorRegistration
>;

export type Attachment =
  | {
      kind: 'transform';
      parent: Transform;
      child: Transform;
    }
  | {
      kind: 'property';
      owner: AnyInstance;
      path: string[];
      previous: unknown;
    };

export type OglRootState = {
  renderer: Renderer;
  gl: Renderer['gl'];
  scene: Transform;
  camera: () => Camera;
  time: Accessor<number>;
  delta: Accessor<number>;
  frame: Accessor<number>;
  fps: Accessor<number>;
  averageFps: Accessor<number>;
  setCamera: (camera: Camera | undefined) => void;
  invalidate: () => void;
  render: () => void;
  resize: () => void;
  resetTiming: () => void;
};

export type OglRoot = {
  kind: 'root';
  children: OglNode[];
  state: OglRootState;
};

export type OglNode = {
  kind: 'node';
  type: string;
  parent: OglParent | null;
  children: OglNode[];
  props: OglRuntimeProps;
  owner?: unknown;
  root?: OglRoot;
  instance?: unknown;
  attachment?: Attachment;
  restoreDefaultCamera?: () => void;
};

export type OglTextNode = {
  kind: 'text';
  value: string;
  parent: OglParent | null;
};

export type OglParent = OglRoot | OglNode;
export type OglHostNode = OglNode | OglTextNode;

export type CanvasProps = Parameters<typeof Canvas>[0];

export type OglCanvasElement = HTMLCanvasElement & {
  __oglState?: OglRootState;
};
