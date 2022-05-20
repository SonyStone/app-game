export interface UnpackedBMP {
  buf: ArrayBuffer;
  width: number;
  height: number;
}

export function unpackBmp(buf: ArrayBuffer): UnpackedBMP {
  // TODO: endian issues
  var iarr = new Uint16Array(buf, 18, 4);
  return { buf: buf.slice(54), width: iarr[0], height: iarr[2] };
}