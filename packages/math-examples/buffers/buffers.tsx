export default function Buffers() {
  {
    // Create an ArrayBuffer with a size in bytes
    const buffer = new ArrayBuffer(16);

    const view = new DataView(buffer);
    view.setFloat64(1, Math.PI);

    console.log(view.getFloat64(1));
    // Expected output: 3.141592653589793
  }

  const buffer = new ArrayBuffer(64 + 64 + 32);
  const vertex = new Vertex();
  vertex.setPos(1, 2);
  vertex.setUV(0.5, 0.5);
  vertex.setColor(255, 0, 0, 255);

  console.group('Vertex', vertex);
  console.log(vertex.getPos());
  console.log(vertex.getUV());
  console.log(vertex.getColor());
  console.groupEnd();

  return (
    <div>
      <h1>Buffers</h1>
      <p>I was thinking about how to implement data structures for webgl buffers</p>
      <div class="flex flex-col">
        <span>vertex</span>
        <span class="ps-2">
          pos:<span class="font-mono text-gray-500">{JSON.stringify(vertex.getPos())}</span>
        </span>
        <span class="ps-2">
          uv:<span class="font-mono text-gray-500">{JSON.stringify(vertex.getUV())}</span>
        </span>
        <span class="ps-2">
          color:<span class="font-mono text-gray-500">{JSON.stringify(vertex.getColor())}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * pub struct Vertex {
 *     /// Logical pixel coordinates (points).
 *     /// (0,0) is the top left corner of the screen.
 *     pub pos: Pos2, // 64 bit
 *
 *     /// Normalized texture coordinates.
 *     /// (0, 0) is the top left corner of the texture.
 *     /// (1, 1) is the bottom right corner of the texture.
 *     pub uv: Pos2, // 64 bit
 *
 *     /// sRGBA with premultiplied alpha
 *     pub color: Color32, // 32 bit
 * }
 */
class Vertex {
  buffer = new ArrayBuffer(64 + 64 + 32);
  index = 0;
  view = new DataView(this.buffer);

  setPos(x: number, y: number) {
    this.view.setFloat64(0 * (this.index + 1), x);
    this.view.setFloat64(8 * (this.index + 1), y);
  }

  getPos() {
    return {
      x: this.view.getFloat64(0 * (this.index + 1)),
      y: this.view.getFloat64(8 * (this.index + 1))
    };
  }

  setUV(x: number, y: number) {
    this.view.setFloat64(16 * (this.index + 1), x);
    this.view.setFloat64(24 * (this.index + 1), y);
  }

  getUV() {
    return {
      x: this.view.getFloat64(16 * (this.index + 1)),
      y: this.view.getFloat64(24 * (this.index + 1))
    };
  }

  setColor(r: number, g: number, b: number, a: number) {
    this.view.setUint8(32 * (this.index + 1), r);
    this.view.setUint8(33 * (this.index + 1), g);
    this.view.setUint8(34 * (this.index + 1), b);
    this.view.setUint8(35 * (this.index + 1), a);
  }

  getColor() {
    return {
      r: this.view.getUint8(32 * (this.index + 1)),
      g: this.view.getUint8(33 * (this.index + 1)),
      b: this.view.getUint8(34 * (this.index + 1)),
      a: this.view.getUint8(35 * (this.index + 1))
    };
  }
}
