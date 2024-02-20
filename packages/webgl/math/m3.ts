import { Mat3Builder, Mat3Tuple } from './m3-builder';

/*#__PURE__*/
export class Mat3 extends Mat3Builder(Array) {}

/*#__PURE__*/
export class FMat3 extends Mat3Builder(Float32Array) {}

export type { Mat3Tuple };
