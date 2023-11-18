import {
  Camera,
  Color,
  ColorRepresentation,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
} from 'three';

import vertexShader from './project.vert?raw';
import fragmentShader from './project.frag?raw';

interface ProjectedMaterialOptions {
  camera: OrthographicCamera | PerspectiveCamera;
  texture: Texture;
  color?: ColorRepresentation;
  transparent?: boolean;
  wireframe?: boolean;
}

type ProjectedMaterial = ShaderMaterial & { isProjectedMaterial: true };

export default function createProjectedMaterial({
  camera,
  texture,
  color,
  transparent,
  wireframe,
}: ProjectedMaterialOptions): ProjectedMaterial {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  camera.updateWorldMatrix(false, false);

  const viewMatrixCamera = camera.matrixWorldInverse.clone();
  const projectionMatrixCamera = camera.projectionMatrix.clone();
  const modelMatrixCamera = camera.matrixWorld.clone();

  const projPosition = camera.position.clone();

  const material = new ShaderMaterial({
    uniforms: {
      color: { value: new Color(color ?? 0x00ff00) },
      pointTexture: { value: texture },
      viewMatrixCamera: { value: viewMatrixCamera },
      projectionMatrixCamera: { value: projectionMatrixCamera },
      modelMatrixCamera: { value: modelMatrixCamera },
      projPosition: { value: projPosition },
      // we will set this later when we will have positioned the object
      savedModelMatrix: { value: new Matrix4() },
    },
    vertexShader,
    fragmentShader,
    transparent: transparent ?? true,
    wireframe: wireframe ?? false,
  }) as ProjectedMaterial;

  material.isProjectedMaterial = true;

  return material;
}

export function project(mesh: Mesh) {
  if (!(mesh.material as ProjectedMaterial).isProjectedMaterial) {
    throw new Error(`The mesh material must be a ProjectedMaterial`);
  }

  // make sure the matrix is updated
  mesh.updateMatrixWorld();

  // we save the object model matrix so it's projected relative
  // to that position, like a snapshot
  (mesh.material as ProjectedMaterial).uniforms.savedModelMatrix.value.copy(
    mesh.matrixWorld
  );
}
