import { createEffect, onCleanup } from 'solid-js';
import {
  BoxGeometry,
  ColorRepresentation,
  Mesh,
  MeshBasicMaterial,
} from 'three';

import { ParentProvider, useParent } from './parent.provider';

export function Cube(props: {
  children?: any;
  width?: number;
  height?: number;
  depth?: number;
  color?: ColorRepresentation;
  x?: number;
  y?: number;
  z?: number;
}) {
  const parent = useParent();

  const geometry = new BoxGeometry(props.width, props.height, props.depth);
  const material = new MeshBasicMaterial({ color: props.color ?? 0x00ff00 });
  const cube = new Mesh(geometry, material);

  createEffect(() => {
    cube.position.setX(props.x ?? 0);
    cube.position.setY(props.y ?? 0);
    cube.position.setZ(props.z ?? 0);
  });

  parent?.add(cube);

  onCleanup(() => {
    geometry.dispose();
    material.dispose();
    parent?.remove(cube);
  });

  return <ParentProvider object3D={cube}>{props.children}</ParentProvider>;
}
