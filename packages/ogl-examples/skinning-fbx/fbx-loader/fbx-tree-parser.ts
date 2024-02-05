// Wrapping modes

import { Mat4, OGLRenderingContext, Texture } from '@packages/ogl';
import type * as FBX from './fbx-tree';

/** With {@link RepeatWrapping} the texture will simply repeat to infinity. */
export const RepeatWrapping = 1000;
/**
 * With {@link ClampToEdgeWrapping} the last pixel of the texture stretches to the edge of the mesh.
 * @remarks This is the _default_ value and behaver for Wrapping Mapping.
 */
export const ClampToEdgeWrapping = 1001;
/** With {@link MirroredRepeatWrapping} the texture will repeats to infinity, mirroring on each repeat. */
export const MirroredRepeatWrapping = 1002;

export function fbxTreeParser(fbxTree: FBX.FBXTree, gl: OGLRenderingContext) {
  const connections = parseConnections(fbxTree);

  const images = parseImages(fbxTree);
  const textures = parseTextures(fbxTree, gl, connections, images);
  // const materials = parseMaterials( textures );
  const deformers = parseDeformers(fbxTree, connections);
  // const geometryMap = new GeometryParser().parse( deformers );

  // parseScene( deformers, geometryMap, materials );

  return {
    connections,
    images,
    textures,
    deformers
  };
}

// Parses FBXTree.Connections which holds parent-child connections between objects (e.g. material -> texture, model->geometry )
// and details the connection type
function parseConnections(fbxTree: FBX.FBXTree) {
  const connectionMap = new Map<number, ConnectionRelationships>();

  if (fbxTree.Connections) {
    const rawConnections = fbxTree.Connections.connections;

    rawConnections.forEach(function (rawConnection) {
      const fromID = rawConnection[0];
      const toID = rawConnection[1];
      const relationship = rawConnection[2];

      if (!connectionMap.has(fromID)) {
        connectionMap.set(fromID, {
          parents: [],
          children: []
        });
      }

      const parentRelationship = { ID: toID, relationship: relationship };
      connectionMap.get(fromID)!.parents.push(parentRelationship);

      if (!connectionMap.has(toID)) {
        connectionMap.set(toID, {
          parents: [],
          children: []
        });
      }

      const childRelationship = { ID: fromID, relationship: relationship };
      connectionMap.get(toID)!.children.push(childRelationship);
    });
  }

  return connectionMap;
}

// Parse FBXTree.Objects.Video for embedded image data
// These images are connected to textures in FBXTree.Objects.Textures
// via FBXTree.Connections.
function parseImages(fbxTree: FBX.FBXTree) {
  const images: { [key: number]: string } = {};
  const blobs: { [key: string]: string | undefined } = {};

  if (fbxTree.Objects.Video) {
    const videoNodes = fbxTree.Objects.Video;

    for (const nodeID in videoNodes) {
      const videoNode = videoNodes[nodeID];

      const id = parseInt(nodeID);

      images[id] = videoNode.RelativeFilename || videoNode.Filename;

      // raw image data is in videoNode.Content
      if (videoNode.Content) {
        const arrayBufferContent = videoNode.Content instanceof ArrayBuffer && videoNode.Content.byteLength > 0;
        const base64Content = typeof videoNode.Content === 'string' && videoNode.Content !== '';

        if (arrayBufferContent || base64Content) {
          const image = parseImage(videoNodes[nodeID]);

          blobs[videoNode.RelativeFilename || videoNode.Filename] = image;
        }
      }
    }
  }

  for (const id in images) {
    const filename = images[id];

    if (blobs[filename] !== undefined) {
      images[id] = blobs[filename]!;
    } else {
      images[id] = images[id].split('\\').pop()!;
    }
  }

  return images;
}

// Parse embedded image data in FBXTree.Video.Content
function parseImage(videoNode: FBX.Video) {
  const content = videoNode.Content;
  const fileName = videoNode.RelativeFilename || videoNode.Filename;
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();

  let type;

  switch (extension) {
    case 'bmp':
      type = 'image/bmp';
      break;

    case 'jpg':
    case 'jpeg':
      type = 'image/jpeg';
      break;

    case 'png':
      type = 'image/png';
      break;

    case 'tif':
      type = 'image/tiff';
      break;

    case 'tga':
      // if ( manager.getHandler( '.tga' ) === null ) {

      console.warn('FBXLoader: TGA loader not found, skipping ', fileName);

      // }

      type = 'image/tga';
      break;

    default:
      console.warn('FBXLoader: Image type "' + extension + '" is not supported.');
      return;
  }

  if (typeof content === 'string') {
    // ASCII format

    return 'data:' + type + ';base64,' + content;
  } else {
    // Binary Format

    const array = new Uint8Array(content);
    return window.URL.createObjectURL(new Blob([array], { type: type }));
  }
}

// Parse nodes in FBXTree.Objects.Texture
// These contain details such as UV scaling, cropping, rotation etc and are connected
// to images in FBXTree.Objects.Video
function parseTextures(
  fbxTree: FBX.FBXTree,
  gl: OGLRenderingContext,
  connections: Map<number, ConnectionRelationships>,
  images: { [key: number]: string }
) {
  const textureMap = new Map();

  if (fbxTree.Objects.Texture) {
    const textureNodes = fbxTree.Objects.Texture;
    for (const nodeID in textureNodes) {
      const texture = parseTexture(gl, connections, textureNodes[nodeID], images);
      textureMap.set(parseInt(nodeID), texture);
    }
  }

  return textureMap;
}

// Parse individual node in FBXTree.Objects.Texture
function parseTexture(
  gl: OGLRenderingContext,
  connections: Map<number, ConnectionRelationships>,
  textureNode: FBX.Texture,
  images: { [key: number]: string }
) {
  const texture = loadTexture(gl, connections, textureNode, images);

  texture.id = textureNode.id;

  texture.name = textureNode.attrName;

  const wrapModeU = textureNode.WrapModeU;
  const wrapModeV = textureNode.WrapModeV;

  const valueU = wrapModeU !== undefined ? wrapModeU.value : 0;
  const valueV = wrapModeV !== undefined ? wrapModeV.value : 0;

  // http://download.autodesk.com/us/fbx/SDKdocs/FBX_SDK_Help/files/fbxsdkref/class_k_fbx_texture.html#889640e63e2e681259ea81061b85143a
  // 0: repeat(default), 1: clamp

  texture.wrapS = valueU === 0 ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = valueV === 0 ? RepeatWrapping : ClampToEdgeWrapping;

  // if (textureNode.Scaling) {
  //   const values = textureNode.Scaling.value;

  //   texture.repeat.x = values[0];
  //   texture.repeat.y = values[1];
  // }

  // if (textureNode.Translation) {
  //   const values = textureNode.Translation.value;

  //   texture.offset.x = values[0];
  //   texture.offset.y = values[1];
  // }

  return texture;
}

// load a texture specified as a blob or data URI, or via an external URL using TextureLoader
function loadTexture(
  gl: OGLRenderingContext,
  connections: Map<number, ConnectionRelationships>,
  textureNode: FBX.Texture,
  images: { [key: number]: string }
) {
  let fileName: string;

  const children = connections.get(textureNode.id)!.children;

  if (children !== undefined && children.length > 0 && images[children[0].ID] !== undefined) {
    fileName = images[children[0].ID];

    if (fileName.indexOf('blob:') === 0 || fileName.indexOf('data:') === 0) {
      // this.textureLoader.setPath(undefined);
    }
  }

  const texture = new Texture(gl);

  const extension = textureNode.FileName.slice(-3).toLowerCase();

  if (extension === 'tga') {
    console.warn('FBXLoader: TGA loader not found, creating placeholder texture for', textureNode.RelativeFilename);
    // const loader = this.manager.getHandler('.tga');

    // if (loader === null) {
    //   texture = new Texture();
    // } else {
    //   loader.setPath(this.textureLoader.path);
    //   texture = loader.load(fileName);
    // }
  } else if (extension === 'psd') {
    console.warn(
      'FBXLoader: PSD textures are not supported, creating placeholder texture for',
      textureNode.RelativeFilename
    );
    // texture = new Texture();
  } else {
    const img = new Image();
    img.onload = () => (texture.image = img);
    img.src = fileName!;
  }

  return texture;
}

export interface Relationship {
  ID: number;
  relationship?: string;
}

export interface ConnectionRelationships {
  parents: Relationship[];
  children: Relationship[];
}

export interface MorphTarget {
  id: string;
  rawTargets: RawMorphTarget[] | undefined;
}

export interface Deformers {
  skeletons: { [key: string]: Skeleton };
  morphTargets: {
    [key: string]: MorphTarget;
  };
}

// Parse nodes in FBXTree.Objects.Deformer
// Deformer node can contain skinning or Vertex Cache animation data, however only skinning is supported here
// Generates map of Skeleton-like objects for use later when generating and binding skeletons.
function parseDeformers(fbxTree: FBX.FBXTree, connections: Map<number, ConnectionRelationships>): Deformers {
  const skeletons: { [key: string]: Skeleton } = {};
  const morphTargets: {
    [key: string]: {
      id: string;
      rawTargets: RawMorphTarget[] | undefined;
    };
  } = {};

  if (fbxTree.Objects.Deformer) {
    const DeformerNodes = fbxTree.Objects.Deformer;

    for (const nodeID in DeformerNodes) {
      const deformerNode = DeformerNodes[nodeID];

      const relationships = connections.get(parseInt(nodeID))!;

      if (deformerNode.attrType === 'Skin') {
        const skeleton = parseSkeleton(relationships, DeformerNodes);
        skeleton.ID = nodeID;

        if (relationships.parents.length > 1)
          console.warn('THREE.FBXLoader: skeleton attached to more than one geometry is not supported.');
        skeleton.geometryID = relationships.parents[0].ID;

        skeletons[nodeID] = skeleton;
      } else if (deformerNode.attrType === 'BlendShape') {
        const morphTarget = {
          id: nodeID,
          rawTargets: parseMorphTargets(connections, relationships, DeformerNodes)
        };

        if (relationships.parents.length > 1)
          console.warn('THREE.FBXLoader: morph target attached to more than one geometry is not supported.');

        morphTargets[nodeID] = morphTarget;
      }
    }
  }

  return {
    skeletons: skeletons,
    morphTargets: morphTargets
  };
}

interface RawBone {
  ID: number;
  indices: number[];
  weights: number[];
  transformLink: Mat4;
}

interface Skeleton {
  rawBones: RawBone[];
  bones: any[];
  ID?: string;
  geometryID?: number;
}

// Parse single nodes in FBXTree.Objects.Deformer
// The top level skeleton node has type 'Skin' and sub nodes have type 'Cluster'
// Each skin node represents a skeleton and each cluster node represents a bone
function parseSkeleton(
  relationships: ConnectionRelationships,
  deformerNodes: { [key: number]: FBX.Deformer }
): Skeleton {
  const rawBones: RawBone[] = [];

  relationships.children.forEach(function (child) {
    const boneNode = deformerNodes[child.ID]!;

    if (boneNode.attrType !== 'Cluster') {
      return;
    }

    const rawBone: RawBone = {
      ID: child.ID,
      indices: [],
      weights: [],
      transformLink: new Mat4().fromArray(boneNode.TransformLink!.a)
      // transform: new Matrix4().fromArray( boneNode.Transform.a ),
      // linkMode: boneNode.Mode,
    };

    if (boneNode.Indexes) {
      rawBone.indices = boneNode.Indexes!.a;
      rawBone.weights = boneNode.Weights!.a;
    }

    rawBones.push(rawBone);
  });

  return {
    rawBones: rawBones,
    bones: []
  };
}

interface RawMorphTarget {
  name: string;
  initialWeight: number;
  id: number;
  fullWeights: number[];
  geoID: number;
}

// The top level morph deformer node has type "BlendShape" and sub nodes have type "BlendShapeChannel"
function parseMorphTargets(
  connections: Map<number, ConnectionRelationships>,
  relationships: ConnectionRelationships,
  deformerNodes: { [key: number]: FBX.Deformer }
): RawMorphTarget[] | undefined {
  const rawMorphTargets: RawMorphTarget[] = [];

  for (let i = 0; i < relationships.children.length; i++) {
    const child = relationships.children[i];

    const morphTargetNode = deformerNodes[child.ID];

    if (morphTargetNode.attrType !== 'BlendShapeChannel') {
      return;
    }

    const rawMorphTarget: RawMorphTarget = {
      name: morphTargetNode.attrName,
      initialWeight: morphTargetNode.DeformPercent ?? 0,
      id: morphTargetNode.id,
      fullWeights: morphTargetNode.FullWeights?.a ?? [],
      geoID: connections.get(parseInt(child.ID as any))!.children.filter(function (child) {
        return child.relationship === undefined;
      })[0].ID
    };

    rawMorphTargets.push(rawMorphTarget);
  }

  return rawMorphTargets;
}
