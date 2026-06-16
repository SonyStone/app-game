import {
  Animation,
  AxesHelper,
  BasisManager,
  Box,
  Camera,
  Curve,
  Cylinder,
  DracoManager,
  FaceNormalsHelper,
  Flowmap,
  Geometry,
  GLTFAnimation,
  GLTFLoader,
  GLTFSkin,
  GPGPU,
  GridHelper,
  InstancedMesh,
  KTXTexture,
  Mesh,
  NormalProgram,
  Orbit,
  Path,
  Plane,
  Polyline,
  Post,
  Program,
  Raycast,
  RenderTarget,
  Shadow,
  Skin,
  Sphere,
  Text,
  Texture,
  Texture3D,
  Torus,
  Transform,
  Triangle,
  Tube,
  VertexNormalsHelper,
  WireMesh,
} from 'ogl';
import type {
  ConstructorRegistration,
  OglConstructor,
  RegisteredConstructors,
} from './types';

export const OGL_RENDERER_ELEMENTS = [
  'animation',
  'axesHelper',
  'basisManager',
  'box',
  'camera',
  'curve',
  'cylinder',
  'dracoManager',
  'faceNormalsHelper',
  'flowmap',
  'geometry',
  'gltfAnimation',
  'gltfLoader',
  'gltfSkin',
  'gpgpu',
  'gridHelper',
  'instancedMesh',
  'ktxTexture',
  'mesh',
  'normalProgram',
  'orbit',
  'plane',
  'post',
  'program',
  'raycast',
  'renderTarget',
  'shadow',
  'skin',
  'sphere',
  'texture',
  'texture3d',
  'torus',
  'transform',
  'triangle',
  'tube',
  'vertexNormalsHelper',
  'wireMesh',
] as const;

const glConstructors = new Set([
  'animation',
  'axesHelper',
  'basisManager',
  'box',
  'camera',
  'curve',
  'cylinder',
  'dracoManager',
  'flowmap',
  'geometry',
  'gltfAnimation',
  'gltfLoader',
  'gltfSkin',
  'gpgpu',
  'gridHelper',
  'instancedMesh',
  'ktxTexture',
  'mesh',
  'normalProgram',
  'plane',
  'polyline',
  'post',
  'program',
  'raycast',
  'renderTarget',
  'shadow',
  'skin',
  'sphere',
  'text',
  'texture',
  'texture3d',
  'torus',
  'triangle',
  'tube',
  'wireMesh',
]);

const registry = new Map<string, ConstructorRegistration>();

export const toTagName = (value: string) =>
  value.charAt(0).toLowerCase() + value.slice(1);

const registerIntrinsic = (
  tagName: string,
  constructor: OglConstructor,
  requiresGl = glConstructors.has(tagName),
) => {
  registry.set(tagName, { constructor, requiresGl });
};

const defaultRegistry = {
  animation: Animation,
  axesHelper: AxesHelper,
  basisManager: BasisManager,
  box: Box,
  camera: Camera,
  curve: Curve,
  cylinder: Cylinder,
  dracoManager: DracoManager,
  faceNormalsHelper: FaceNormalsHelper,
  flowmap: Flowmap,
  geometry: Geometry,
  gltfAnimation: GLTFAnimation,
  gltfLoader: GLTFLoader,
  gltfSkin: GLTFSkin,
  gpgpu: GPGPU,
  gridHelper: GridHelper,
  instancedMesh: InstancedMesh,
  ktxTexture: KTXTexture,
  mesh: Mesh,
  normalProgram: NormalProgram,
  orbit: Orbit,
  path: Path,
  plane: Plane,
  polyline: Polyline,
  post: Post,
  program: Program,
  raycast: Raycast,
  renderTarget: RenderTarget,
  shadow: Shadow,
  skin: Skin,
  sphere: Sphere,
  text: Text,
  texture: Texture,
  texture3d: Texture3D,
  torus: Torus,
  transform: Transform,
  triangle: Triangle,
  tube: Tube,
  vertexNormalsHelper: VertexNormalsHelper,
  wireMesh: WireMesh,
} as const satisfies RegisteredConstructors;

for (const [tagName, constructor] of Object.entries(defaultRegistry)) {
  registerIntrinsic(tagName, constructor as OglConstructor);
}

export const resolveRegistration = (type: string) =>
  registry.get(type) ?? registry.get(toTagName(type));

export const extend = (constructors: RegisteredConstructors) => {
  for (const [name, value] of Object.entries(constructors)) {
    const registration =
      typeof value === 'function' ? { constructor: value } : value;
    registerIntrinsic(name, registration.constructor, registration.requiresGl);
    registerIntrinsic(
      toTagName(registration.constructor.name),
      registration.constructor,
      registration.requiresGl,
    );
  }
};
