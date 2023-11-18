import {
  BoxGeometry,
  Color,
  ColorRepresentation,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector3,
} from 'three';

import vertexShader from './project.vert?raw';
import fragmentShader from './project.frag?raw';

interface Box {
  color: ColorRepresentation;
  texture: Texture;
  viewMatrixCamera: Matrix4;
  projectionMatrixCamera: Matrix4;
  modelMatrixCamera: Matrix4;
  projPosition: Vector3;
}

export function createBox({
  color,
  texture,
  viewMatrixCamera,
  projectionMatrixCamera,
  modelMatrixCamera,
  projPosition,
}: Box) {
  const geometry = new PlaneGeometry(550, 550);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: {
      color: { value: new Color(color) },
      pointTexture: { value: texture },
      viewMatrixCamera: { value: viewMatrixCamera },
      projectionMatrixCamera: { value: projectionMatrixCamera },
      modelMatrixCamera: { value: modelMatrixCamera },
      projPosition: { value: projPosition },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
  });

  return new Mesh(geometry, material);
}
