import type {
  Animation as OglAnimation,
  AnimationOptions,
  AxesHelper as OglAxesHelper,
  AxesHelperOptions,
  BasisManager as OglBasisManager,
  Box as OglBox,
  BoxOptions,
  Camera as OglCamera,
  CameraOptions,
  Curve as OglCurve,
  CurveOptions,
  Cylinder as OglCylinder,
  CylinderOptions,
  DracoManager as OglDracoManager,
  FaceNormalsHelper as OglFaceNormalsHelper,
  FaceNormalsHelperOptions,
  Flowmap as OglFlowmap,
  FlowmapOptions,
  Geometry as OglGeometry,
  GLTFAnimation as OglGLTFAnimation,
  GLTFLoader as OglGLTFLoader,
  GLTFSkin as OglGLTFSkin,
  GLTFSkinOptions,
  GPGPU as OglGPGPU,
  GPGPUOptions,
  GridHelper as OglGridHelper,
  GridHelperOptions,
  InstancedMesh as OglInstancedMesh,
  KTXTexture as OglKTXTexture,
  KTXTextureOptions,
  Mesh as OglMesh,
  MeshOptions,
  NormalProgram as OglNormalProgram,
  Orbit as OglOrbit,
  OrbitOptions,
  Path as OglPath,
  Plane as OglPlane,
  PlaneOptions,
  Polyline as OglPolyline,
  PolylineOptions,
  Post as OglPost,
  PostOptions,
  Program as OglProgram,
  ProgramOptions,
  Raycast as OglRaycast,
  RenderTarget as OglRenderTarget,
  RenderTargetOptions,
  Shadow as OglShadow,
  ShadowOptions,
  Skin as OglSkin,
  SkinOptions,
  Sphere as OglSphere,
  SphereOptions,
  Text as OglText,
  TextOptions,
  Texture as OglTexture,
  Texture3D as OglTexture3D,
  Texture3DOptions,
  TextureOptions,
  Torus as OglTorus,
  TorusOptions,
  Transform as OglTransform,
  Triangle as OglTriangle,
  Tube as OglTube,
  TubeOptions,
  VertexNormalsHelper as OglVertexNormalsHelper,
  VertexNormalsHelperOptions,
  WireMesh as OglWireMesh,
  WireMeshOptions,
} from 'ogl';
import { createElement as createOglElement, insert, spread } from './renderer';
import type { OglElementProps } from './types';

type GlOptionsArgs<TOptions extends object> = [Partial<TOptions>?];
type OptionsArgs<TPrimary, TOptions extends object> = [
  TPrimary,
  Partial<TOptions>?,
];

const createOglComponent = <
  TInstance,
  TArgs extends readonly unknown[] = readonly unknown[],
  TConstructorProps extends object = {},
>(
  tagName: string,
) => {
  return (props: OglElementProps<TInstance, TArgs, TConstructorProps>) => {
    const node = createOglElement(tagName);

    spread(node, () => props);
    insert(node as any, () => props.children);

    return node as any;
  };
};

export const Animation = createOglComponent<
  OglAnimation,
  GlOptionsArgs<AnimationOptions>,
  AnimationOptions
>('animation');
export const AxesHelper = createOglComponent<
  OglAxesHelper,
  GlOptionsArgs<AxesHelperOptions>,
  AxesHelperOptions
>('axesHelper');
export const BasisManager = createOglComponent<OglBasisManager>('basisManager');
export const Box = createOglComponent<
  OglBox,
  GlOptionsArgs<BoxOptions>,
  BoxOptions
>('box');
export const Camera = createOglComponent<
  OglCamera,
  GlOptionsArgs<CameraOptions>,
  CameraOptions
>('camera');
export const Curve = createOglComponent<
  OglCurve,
  GlOptionsArgs<CurveOptions>,
  CurveOptions
>('curve');
export const Cylinder = createOglComponent<
  OglCylinder,
  GlOptionsArgs<CylinderOptions>,
  CylinderOptions
>('cylinder');
export const DracoManager = createOglComponent<OglDracoManager>('dracoManager');
export const FaceNormalsHelper = createOglComponent<
  OglFaceNormalsHelper,
  OptionsArgs<OglMesh, FaceNormalsHelperOptions>,
  FaceNormalsHelperOptions
>('faceNormalsHelper');
export const Flowmap = createOglComponent<
  OglFlowmap,
  GlOptionsArgs<FlowmapOptions>,
  FlowmapOptions
>('flowmap');
export const Geometry = createOglComponent<OglGeometry>('geometry');
export const GLTFAnimation =
  createOglComponent<OglGLTFAnimation>('gltfAnimation');
export const GLTFLoader = createOglComponent<OglGLTFLoader>('gltfLoader');
export const GLTFSkin = createOglComponent<
  OglGLTFSkin,
  GlOptionsArgs<GLTFSkinOptions>,
  GLTFSkinOptions
>('gltfSkin');
export const GPGPU = createOglComponent<
  OglGPGPU,
  GlOptionsArgs<GPGPUOptions>,
  GPGPUOptions
>('gpgpu');
export const GridHelper = createOglComponent<
  OglGridHelper,
  GlOptionsArgs<GridHelperOptions>,
  GridHelperOptions
>('gridHelper');
export const InstancedMesh =
  createOglComponent<OglInstancedMesh>('instancedMesh');
export const KTXTexture = createOglComponent<
  OglKTXTexture,
  GlOptionsArgs<KTXTextureOptions>,
  KTXTextureOptions
>('ktxTexture');
export const Mesh = createOglComponent<
  OglMesh,
  GlOptionsArgs<MeshOptions>,
  MeshOptions
>('mesh');
export const NormalProgram =
  createOglComponent<OglNormalProgram>('normalProgram');
export const Orbit = createOglComponent<
  OglOrbit,
  OptionsArgs<OglCamera, OrbitOptions>,
  OrbitOptions
>('orbit');
export const Path = createOglComponent<OglPath>('path');
export const Plane = createOglComponent<
  OglPlane,
  GlOptionsArgs<PlaneOptions>,
  PlaneOptions
>('plane');
export const Polyline = createOglComponent<
  OglPolyline,
  GlOptionsArgs<PolylineOptions>,
  PolylineOptions
>('polyline');
export const Post = createOglComponent<
  OglPost,
  GlOptionsArgs<PostOptions>,
  PostOptions
>('post');
export const Program = createOglComponent<
  OglProgram,
  GlOptionsArgs<ProgramOptions>,
  ProgramOptions
>('program');
export const Raycast = createOglComponent<OglRaycast>('raycast');
export const RenderTarget = createOglComponent<
  OglRenderTarget,
  GlOptionsArgs<RenderTargetOptions>,
  RenderTargetOptions
>('renderTarget');
export const Shadow = createOglComponent<
  OglShadow,
  GlOptionsArgs<ShadowOptions>,
  ShadowOptions
>('shadow');
export const Skin = createOglComponent<
  OglSkin,
  GlOptionsArgs<SkinOptions>,
  SkinOptions
>('skin');
export const Sphere = createOglComponent<
  OglSphere,
  GlOptionsArgs<SphereOptions>,
  SphereOptions
>('sphere');
export const Text = createOglComponent<
  OglText,
  GlOptionsArgs<TextOptions>,
  TextOptions
>('text');
export const Texture = createOglComponent<
  OglTexture,
  GlOptionsArgs<TextureOptions>,
  TextureOptions
>('texture');
export const Texture3D = createOglComponent<
  OglTexture3D,
  GlOptionsArgs<Texture3DOptions>,
  Texture3DOptions
>('texture3d');
export const Torus = createOglComponent<
  OglTorus,
  GlOptionsArgs<TorusOptions>,
  TorusOptions
>('torus');
export const Transform = createOglComponent<OglTransform>('transform');
export const Triangle = createOglComponent<OglTriangle>('triangle');
export const Tube = createOglComponent<
  OglTube,
  GlOptionsArgs<TubeOptions>,
  TubeOptions
>('tube');
export const VertexNormalsHelper = createOglComponent<
  OglVertexNormalsHelper,
  OptionsArgs<OglMesh, VertexNormalsHelperOptions>,
  VertexNormalsHelperOptions
>('vertexNormalsHelper');
export const WireMesh = createOglComponent<
  OglWireMesh,
  GlOptionsArgs<WireMeshOptions>,
  WireMeshOptions
>('wireMesh');
