import { OGLRenderingContext } from '@packages/ogl';
import { fbxTextParser } from './fbx-text-parser';
import { fbxTreeParser } from './fbx-tree-parser';
import * as Utils from './utils';

export function parse(fbxBuffer: ArrayBuffer, gl: OGLRenderingContext) {
  if (Utils.isFbxFormatBinary(fbxBuffer)) {
    console.log(`is binary`);
  } else {
    const fbxText = Utils.convertArrayBufferToString(fbxBuffer);
    if (!Utils.isFbxFormatASCII(fbxText)) {
      throw new Error('FBX parser: Unknown format.');
    }

    if (Utils.getFbxVersion(fbxText) < 7000) {
      throw new Error('FBX parser: FBX version not supported, FileVersion: ' + Utils.getFbxVersion(fbxText));
    }

    const fbxTree = fbxTextParser(fbxText);

    const fbxData = fbxTreeParser(fbxTree, gl);

    console.log(`fbxTree`, fbxTree);
    console.log(`fbxData`, fbxData);
  }
}
