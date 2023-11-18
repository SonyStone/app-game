import { createContext, useContext } from 'solid-js';
import { Object3D } from 'three';

const ParentContext = createContext<Object3D>();

export function ParentProvider(props: { children: any; object3D: Object3D }) {
  return (
    <ParentContext.Provider value={props.object3D}>
      {props.children}
    </ParentContext.Provider>
  );
}

export function useParent() {
  return useContext(ParentContext);
}
