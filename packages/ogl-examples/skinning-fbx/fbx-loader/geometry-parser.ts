import { Euler, Mat4, Vec3 } from '@packages/ogl';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import * as FBX from './fbx-tree';
import { ConnectionRelationships, Deformers, MorphTarget, Skeleton } from './fbx-tree-parser';
import { clone, extractRotation, makeRotationFromEuler } from './mat4';
import { degToRad } from './math-utils';

export function geometryParser(
  fbxTree: FBX.FBXTree,
  connections: Map<number, ConnectionRelationships>,
  deformers: Deformers
) {
  let negativeMaterialIndices = false;
  const geometryMap = new Map();

  if (fbxTree.Objects.Geometry) {
    const geoNodes = fbxTree.Objects.Geometry;

    for (const nodeID in geoNodes) {
      const relationships = connections.get(parseInt(nodeID))!;
      const geo = parseGeometry(fbxTree, relationships, geoNodes[nodeID], deformers);

      geometryMap.set(parseInt(nodeID), geo);
    }
  }

  // report warnings

  if (negativeMaterialIndices === true) {
    console.warn(
      'THREE.FBXLoader: The FBX file contains invalid (negative) material indices. The asset might not render as expected.'
    );
  }

  return geometryMap;
}

// Parse single node in FBXTree.Objects.Geometry
function parseGeometry(
  fbxTree: FBX.FBXTree,
  relationships: ConnectionRelationships,
  geoNode: FBX.Geometry,
  deformers: Deformers
) {
  switch (geoNode.attrType) {
    case 'Mesh':
      return parseMeshGeometry(fbxTree, relationships, geoNode, deformers);
      break;

    case 'NurbsCurve':
      return parseNurbsGeometry(geoNode);
      break;
  }
}

interface TransformData {
  eulerOrder?: EulerOrder;
  inheritType?: number;
  translation?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  preRotation?: Vec3;
  postRotation?: Vec3;
  scalingOffset?: Vec3;
  scalingPivot?: Vec3;
  rotationOffset?: Vec3;
  rotationPivot?: Vec3;
  parentMatrixWorld?: Mat4;
  parentMatrix?: Mat4;
}

function // Parse single node mesh geometry in FBXTree.Objects.Geometry
parseMeshGeometry(
  fbxTree: FBX.FBXTree,
  relationships: ConnectionRelationships,
  geoNode: FBX.Geometry,
  deformers: Deformers
) {
  const skeletons = deformers.skeletons;
  const morphTargets: MorphTarget[] = [];

  const modelNodes = relationships.parents.map(function (parent) {
    return fbxTree.Objects.Model[parent.ID];
  });

  // don't create geometry if it is not associated with any models
  if (modelNodes.length === 0) return;

  const skeleton = relationships.children.reduce((skeleton: Skeleton | undefined, child) => {
    if (skeletons[child.ID] !== undefined) {
      skeleton = skeletons[child.ID];
    }

    return skeleton;
  }, undefined);

  relationships.children.forEach(function (child) {
    if (deformers.morphTargets[child.ID] !== undefined) {
      morphTargets.push(deformers.morphTargets[child.ID]);
    }
  });

  // Assume one model and get the preRotation from that
  // if there is more than one model associated with the geometry this may cause problems
  const modelNode = modelNodes[0];

  const transformData: TransformData = {};

  if (modelNode.RotationOrder) {
    transformData.eulerOrder = getEulerOrder(modelNode.RotationOrder.value);
  }
  if (modelNode.InheritType) {
    transformData.inheritType = parseInt(modelNode.InheritType.value as string);
  }

  if (modelNode.GeometricTranslation) {
    transformData.translation = modelNode.GeometricTranslation.value;
  }
  if (modelNode.GeometricRotation) {
    transformData.rotation = modelNode.GeometricRotation.value;
  }
  if (modelNode.GeometricScaling) {
    transformData.scale = modelNode.GeometricScaling.value;
  }

  const transform = generateTransform(transformData);

  return genGeometry(geoNode, skeleton, morphTargets, transform);
}

type EulerOrder = 'ZYX' | 'YZX' | 'XZY' | 'ZXY' | 'YXZ' | 'XYZ';

// Returns the three.js intrinsic Euler order corresponding to FBX extrinsic Euler order
// ref: http://help.autodesk.com/view/FBX/2017/ENU/?guid=__cpp_ref_class_fbx_euler_html
function getEulerOrder(order: number): EulerOrder {
  order = order || 0;

  const enums = [
    'ZYX', // -> XYZ extrinsic
    'YZX', // -> XZY extrinsic
    'XZY', // -> YZX extrinsic
    'ZXY', // -> YXZ extrinsic
    'YXZ', // -> ZXY extrinsic
    'XYZ' // -> ZYX extrinsic
    //'SphericXYZ', // not possible to support
  ];

  if (order === 6) {
    console.warn('THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect.');
    return enums[0] as EulerOrder;
  }

  return enums[order] as EulerOrder;
}

const tempEuler = new Euler();
const EULER_DEFAULT_ORDER = 'XYZ';
const tempVec = new Vec3();

// generate transformation from FBX transform data
// ref: https://help.autodesk.com/view/FBX/2017/ENU/?guid=__files_GUID_10CDD63C_79C1_4F2D_BB28_AD2BE65A02ED_htm
// ref: http://docs.autodesk.com/FBX/2014/ENU/FBX-SDK-Documentation/index.html?url=cpp_ref/_transformations_2main_8cxx-example.html,topicNumber=cpp_ref__transformations_2main_8cxx_example_htmlfc10a1e1-b18d-4e72-9dc0-70d0f1959f5e
function generateTransform(transformData: TransformData) {
  const lTranslationM = new Mat4();
  const lPreRotationM = new Mat4();
  const lRotationM = new Mat4();
  const lPostRotationM = new Mat4();

  const lScalingM = new Mat4();
  const lScalingPivotM = new Mat4();
  const lScalingOffsetM = new Mat4();
  const lRotationOffsetM = new Mat4();
  const lRotationPivotM = new Mat4();

  const lParentGX = new Mat4();
  const lParentLX = new Mat4();
  const lGlobalT = new Mat4();

  const inheritType = transformData.inheritType ? transformData.inheritType : 0;

  if (transformData.translation) lTranslationM.setPosition(tempVec.fromArray(transformData.translation));

  if (transformData.preRotation) {
    tempEuler.fromArray(transformData.preRotation.map(degToRad));
    tempEuler.order = transformData.eulerOrder || EULER_DEFAULT_ORDER;
    makeRotationFromEuler(lPreRotationM, tempEuler);
  }

  if (transformData.rotation) {
    tempEuler.fromArray(transformData.rotation.map(degToRad));
    tempEuler.order = transformData.eulerOrder || EULER_DEFAULT_ORDER;
    makeRotationFromEuler(lRotationM, tempEuler);
  }

  if (transformData.postRotation) {
    tempEuler.fromArray(transformData.postRotation.map(degToRad));
    tempEuler.order = transformData.eulerOrder || EULER_DEFAULT_ORDER;
    makeRotationFromEuler(lPostRotationM, tempEuler);
    lPostRotationM.inverse();
  }

  if (transformData.scale) lScalingM.scale(tempVec.fromArray(transformData.scale));

  // Pivots and offsets
  if (transformData.scalingOffset) {
    lScalingOffsetM.setPosition(tempVec.fromArray(transformData.scalingOffset));
  }
  if (transformData.scalingPivot) {
    lScalingPivotM.setPosition(tempVec.fromArray(transformData.scalingPivot));
  }
  if (transformData.rotationOffset) {
    lRotationOffsetM.setPosition(tempVec.fromArray(transformData.rotationOffset));
  }
  if (transformData.rotationPivot) {
    lRotationPivotM.setPosition(tempVec.fromArray(transformData.rotationPivot));
  }

  // parent transform
  if (transformData.parentMatrix && transformData.parentMatrixWorld) {
    lParentLX.copy(transformData.parentMatrix);
    lParentGX.copy(transformData.parentMatrixWorld);
  }

  const lLRM = clone(lPreRotationM).multiply(lRotationM).multiply(lPostRotationM);
  // Global Rotation
  const lParentGRM = new Mat4();
  extractRotation(lParentGRM, lParentGX);

  // Global Shear*Scaling
  const lParentTM = new Mat4();
  lParentTM.copyPosition(lParentGX);

  const lParentGRSM = clone(lParentTM).inverse().multiply(lParentGX);
  const lParentGSM = clone(lParentGRM).inverse().multiply(lParentGRSM);
  const lLSM = lScalingM;

  const lGlobalRS = new Mat4();

  if (inheritType === 0) {
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM).multiply(lLSM);
  } else if (inheritType === 1) {
    lGlobalRS.copy(lParentGRM).multiply(lParentGSM).multiply(lLRM).multiply(lLSM);
  } else {
    const lParentLSM = new Mat4().scale(new Vec3().setFromMatrixScale(lParentLX));
    const lParentLSM_inv = clone(lParentLSM).inverse();
    const lParentGSM_noLocal = clone(lParentGSM).multiply(lParentLSM_inv);

    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM_noLocal).multiply(lLSM);
  }

  const lRotationPivotM_inv = clone(lRotationPivotM).inverse();
  const lScalingPivotM_inv = clone(lScalingPivotM).inverse();
  // Calculate the local transform matrix
  let lTransform = clone(lTranslationM)
    .multiply(lRotationOffsetM)
    .multiply(lRotationPivotM)
    .multiply(lPreRotationM)
    .multiply(lRotationM)
    .multiply(lPostRotationM)
    .multiply(lRotationPivotM_inv)
    .multiply(lScalingOffsetM)
    .multiply(lScalingPivotM)
    .multiply(lScalingM)
    .multiply(lScalingPivotM_inv);

  const lLocalTWithAllPivotAndOffsetInfo = new Mat4().copyPosition(lTransform);

  const lGlobalTranslation = clone(lParentGX).multiply(lLocalTWithAllPivotAndOffsetInfo);
  lGlobalT.copyPosition(lGlobalTranslation);

  lTransform = lGlobalT.clone().multiply(lGlobalRS);

  // from global to local
  lTransform.premultiply(lParentGX.invert());

  return lTransform;
}
