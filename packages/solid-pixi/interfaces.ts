import { JSX } from '@solidjs/web/jsx-runtime';
import { type Renderable } from 'pixi.js';

export interface CommonProps<Component = Renderable, Data = object> {
  children?: JSX.Element;
  ref?: (val: Component & Data) => void;
  as?: Component;
}

export const CommonPropKeys: (keyof CommonProps<Renderable>)[] = ['children', 'ref', 'as'] as const;
