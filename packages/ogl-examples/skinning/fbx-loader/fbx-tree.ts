import { Mat4Tuple, Vec3Tuple } from 'ogl';

export interface FBXTree {
  Connections: {
    connections: ([number, number] | [number, number, string])[];
    name: 'Connections';
  };
  Definitions: any;
  Documents: any;
  FBXHeaderExtension: any;
  GlobalSettings: any;
  Objects: {
    AnimationCurve: { [key: number]: any };
    Deformer: { [key: number]: Deformer };
    Video: { [key: number]: Video };
    Texture: { [key: number]: Texture };
    Geometry: { [key: number]: Geometry };
    Model: { [key: number]: Model };
  };
  [key: string]: any;
}

export interface Video {
  Content: string | ArrayBuffer;
  Filename: string;
  Path: KString;
  RelPath: KString;
  RelativeFilename: string;
  Type: 'Clip';
  UseMipMap: string;
  attrName: string;
  attrType: 'Clip';
  id: number;
  name: 'Video';
}

export interface Deformer {
  Link_DeformAcuracy?: string;
  Indexes?: {
    name: 'Indexes';
    a: number[];
  };
  Transform?: {
    a: Mat4Tuple;
    name: 'Transform';
  };
  TransformLink?: {
    a: Mat4Tuple;
    name: 'TransformLink';
  };
  DeformPercent?: number;
  FullWeights?: {
    a: number[];
    name: 'FullWeights';
  };
  UserData?: string;
  Version: string;
  Weights?: {
    a: number[];
    name: 'Weights';
  };
  attrName: string;
  attrType: 'Skin' | 'BlendShape' | 'Cluster' | 'BlendShapeChannel';
  id: number;
  name: 'Deformer';
}

export interface Texture {
  Cropping: string;
  CurrentTextureBlendMode: {
    type: 'enum';
    type2: string;
    flag: string;
    value: number;
  };
  FileName: string;
  Media: string;
  ModelUVScaling: string;
  ModelUVTranslation: string;
  RelativeFilename: string;
  TextureName: string;
  Texture_Alpha_Source: string;
  Type: 'TextureVideoClip';
  UVSet: KString;
  UseMaterial: { type: 'bool'; type2: ''; flag: ''; value: 1 };
  Version: string;
  attrName: string;
  id: number;
  name: 'Texture';

  WrapModeU?: { value: number };
  WrapModeV?: { value: number };

  Scaling?: { value: [number, number] };
  Translation?: { value: [number, number] };
}

export interface Geometry {
  Edges: { name: 'Edges'; a: number[] };
  GeometryVersion: string;
  Layer: any;
  LayerElementMaterial: any;
  LayerElementNormal: any;
  LayerElementUV: any;
  PolygonVertexIndex: { name: 'PolygonVertexIndex'; a: number[] };
  Vertices: { name: 'Vertices'; a: number[] };
  attrName: string;
  attrType: 'Mesh' | 'NurbsCurve';
  id: number;
  name: 'Geometry';
}

export interface Model {
  Culling: 'CullingOff';
  DefaultAttributeIndex: {
    type: 'int';
    type2: 'Integer';
    flag: string;
    value: 0;
  };
  RotationOrder?: { type: 'enum', value: number };
  InheritType: { type: 'enum'; type2: string; flag: string; value: number | string };
  GeometricTranslation?: { type: any, value: Vec3Tuple },
  GeometricRotation?: { type: any, value: Vec3Tuple },
  GeometricScaling?: { type: any, value: Vec3Tuple },
  Lcl_Rotation: {
    type: 'Lcl_Rotation';
    type2: '';
    flag: string;
    value: Vec3Tuple;
  };
  Lcl_Scaling: {
    type: 'Lcl_Scaling';
    type2: '';
    flag: string;
    value: Vec3Tuple;
  };
  Lcl_Translation: {
    type: 'Lcl_Translation';
    type2: '';
    flag: string;
    value: Vec3Tuple;
  };
  PreRotation: {
    type: 'Vector3D';
    type2: 'Vector';
    flag: string;
    value: Vec3Tuple;
  };
  PreferedAngleX: {
    type: 'double';
    type2: 'Number';
    flag: string;
    value: number;
  };
  PreferedAngleY: {
    type: 'double';
    type2: 'Number';
    flag: string;
    value: number;
  };
  PreferedAngleZ: {
    type: 'double';
    type2: 'Number';
    flag: string;
    value: number;
  };
  RotationActive: { type: 'bool'; type2: ''; flag: string; value: number };
  ScalingMax: {
    type: 'Vector3D';
    type2: 'Vector';
    flag: string;
    value: Vec3Tuple;
  };

  Shading: string;
  Version: string;
  attrName: string;
  attrType: 'LimbNode';
  filmboxTypeID: { type: 'Short'; type2: ''; flag: string; value: string };
  id: number;
  lockInfluenceWeights: {
    type: 'Bool';
    type2: '';
    flag: string;
    value: string;
  };
  name: 'Model';
}

interface KString {
  type: 'KString';
  type2: string;
  flag: string;
  value: string;
}

// FBXTree holds a representation of the FBX data, returned by the TextParser ( FBX ASCII format)
// and BinaryParser( FBX Binary format)
export class FBXTree implements FBXTree {
  add(key: string, val: any) {
    this[key] = val;
  }
}
