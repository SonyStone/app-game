import { BinaryReader } from "./binary-reader";
import { unzlibSync } from "fflate";

type Property =
  | string
  | number
  | bigint
  | boolean
  | Buffer
  | boolean[]
  | number[];

interface Node {
  id: number;
  name: string;
  propertyList: Property[];
  singleProperty: Property;
  attrName?: Property;
  attrType?: Property;
  [key: string]: any;
}

export function parseNode(reader: BinaryReader, version: number): Node | null {
  const node: Node = {} as Node;

  // The first three data sizes depends on version.
  const endOffset = version >= 7500 ? reader.getUint64() : reader.getUint32();
  const numProperties =
    version >= 7500 ? reader.getUint64() : reader.getUint32();

  // the returned propertyListLen is not used
  version >= 7500 ? reader.getUint64() : reader.getUint32();

  const nameLen = reader.getUint8();
  const name = reader.getString(nameLen);

  // Regards this node as NULL-record if endOffset is zero
  if (endOffset === 0) return null;

  const propertyList: Property[] = [];

  for (let i = 0; i < numProperties; i++) {
    propertyList.push(parseProperty(reader));
  }

  // Regards the first three elements in propertyList as id, attrName, and attrType
  const id = propertyList.length > 0 ? propertyList[0] : "";
  const attrName = propertyList.length > 1 ? propertyList[1] : "";
  const attrType = propertyList.length > 2 ? propertyList[2] : "";

  // check if this node represents just a single property
  // like (name, 0) set or (name2, [0, 1, 2]) set of {name: 0, name2: [0, 1, 2]}
  node.singleProperty =
    numProperties === 1 && reader.getOffset() === endOffset ? true : false;

  while (endOffset > reader.getOffset()) {
    const subNode = parseNode(reader, version);

    if (subNode !== null) parseSubNode(name, node, subNode);
  }

  node.propertyList = propertyList; // raw property list used by parent

  if (typeof id === "number") node.id = id;
  if (attrName !== "") node.attrName = attrName;
  if (attrType !== "") node.attrType = attrType;
  if (name !== "") node.name = name;

  return node;
}

function parseProperty(reader: BinaryReader): Property {
  const type = reader.getString(1);
  let length;

  switch (type) {
    case "C":
      return reader.getBoolean();

    case "D":
      return reader.getFloat64();

    case "F":
      return reader.getFloat32();

    case "I":
      return reader.getInt32();

    case "L":
      return reader.getInt64();

    case "R":
      length = reader.getUint32();
      return reader.getArrayBuffer(length);

    case "S":
      length = reader.getUint32();
      return reader.getString(length);

    case "Y":
      return reader.getInt16();

    case "b":
    case "c":
    case "d":
    case "f":
    case "i":
    case "l":
      const arrayLength = reader.getUint32();
      const encoding = reader.getUint32(); // 0: non-compressed, 1: compressed
      const compressedLength = reader.getUint32();

      if (encoding === 0) {
        switch (type) {
          case "b":
          case "c":
            return reader.getBooleanArray(arrayLength);

          case "d":
            return reader.getFloat64Array(arrayLength);

          case "f":
            return reader.getFloat32Array(arrayLength);

          case "i":
            return reader.getInt32Array(arrayLength);

          case "l":
            return reader.getInt64Array(arrayLength);
        }
      }

      const buffer = unzlibSync(reader.getArrayBuffer(compressedLength));

      const reader2 = new BinaryReader(toBuffer(buffer));

      switch (type) {
        case "b":
        case "c":
          return reader2.getBooleanArray(arrayLength);

        case "d":
          return reader2.getFloat64Array(arrayLength);

        case "f":
          return reader2.getFloat32Array(arrayLength);

        case "i":
          return reader2.getInt32Array(arrayLength);

        case "l":
          return reader2.getInt64Array(arrayLength);
      }

      break; // cannot happen but is required by the DeepScan

    default:
      throw new Error(`FBXLoader: Unknown property type "${type}"`);
  }
}

function toBuffer(ab: Uint8Array): Buffer {
  const buf = Buffer.alloc(ab.byteLength);
  const view = ab;
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}

function parseSubNode(name: string, node: Node, subNode: Node) {
  // special case: child node is single property
  if (subNode.singleProperty === true) {
    const value = subNode.propertyList[0];

    if (Array.isArray(value)) {
      node[subNode.name] = subNode;

      subNode.a = value;
    } else {
      node[subNode.name] = value;
    }
  } else if (name === "Connections" && subNode.name === "C") {
    const array: Property[] = [];

    subNode.propertyList.forEach(function (property, i) {
      // first Connection is FBX type (OO, OP, etc.). We'll discard these
      if (i !== 0) array.push(property);
    });

    if (node.connections === undefined) {
      node.connections = [];
    }

    node.connections.push(array);
  } else if (subNode.name === "Properties70") {
    const keys = Object.keys(subNode);

    keys.forEach(function (key) {
      node[key] = subNode[key];
    });
  } else if (name === "Properties70" && subNode.name === "P") {
    let innerPropName = subNode.propertyList[0] as string;
    let innerPropType1 = subNode.propertyList[1] as string;
    const innerPropType2 = subNode.propertyList[2];
    const innerPropFlag = subNode.propertyList[3];
    let innerPropValue;

    if (innerPropName.indexOf("Lcl ") === 0)
      innerPropName = innerPropName.replace("Lcl ", "Lcl_");
    if (innerPropType1.indexOf("Lcl ") === 0)
      innerPropType1 = innerPropType1.replace("Lcl ", "Lcl_");

    if (
      innerPropType1 === "Color" ||
      innerPropType1 === "ColorRGB" ||
      innerPropType1 === "Vector" ||
      innerPropType1 === "Vector3D" ||
      innerPropType1.indexOf("Lcl_") === 0
    ) {
      innerPropValue = [
        subNode.propertyList[4],
        subNode.propertyList[5],
        subNode.propertyList[6],
      ];
    } else {
      innerPropValue = subNode.propertyList[4];
    }

    // this will be copied to parent, see above
    node[innerPropName] = {
      type: innerPropType1,
      type2: innerPropType2,
      flag: innerPropFlag,
      value: innerPropValue,
    };
  } else if (node[subNode.name] === undefined) {
    if (typeof subNode.id === "number") {
      node[subNode.name] = {};
      node[subNode.name][subNode.id] = subNode;
    } else {
      node[subNode.name] = subNode;
    }
  } else {
    if (subNode.name === "PoseNode") {
      if (!Array.isArray(node[subNode.name])) {
        node[subNode.name] = [node[subNode.name]];
      }

      node[subNode.name].push(subNode);
    } else if (node[subNode.name][subNode.id] === undefined) {
      node[subNode.name][subNode.id] = subNode;
    }
  }
}
