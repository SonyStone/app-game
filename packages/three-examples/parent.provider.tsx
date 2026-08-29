import { createContext, useContext } from 'solid-js';
import { Object3D } from 'three';

const ParentContext = createContext<Object3D>();

export function ParentProvider(props: { children: any; object3D: Object3D }) {
  return <ParentContext value={props.object3D}>{props.children}</ParentContext>;
}

export function useParent() {
  return useContext(ParentContext);
}
