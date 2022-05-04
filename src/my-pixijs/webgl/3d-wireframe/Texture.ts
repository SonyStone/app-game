// ! Недоделано ! Нет getTexture
export class Texture {
  gl: WebGL2RenderingContext;
  _glTexture: any;

  width: number;
  height: number;
  params: any;

  image: any;
  framebuffer: any;
  data: any;

  constructor(gl: WebGL2RenderingContext, opts: any) {
    opts = opts || {};
    this.gl = gl;
    this.params = opts.params || [
      {
        type: 'i',
        target: gl.TEXTURE_2D,
        name: gl.TEXTURE_WRAP_S,
        value: gl.MIRRORED_REPEAT,
      },
      {
        type: 'i',
        target: gl.TEXTURE_2D,
        name: gl.TEXTURE_WRAP_T,
        value: gl.MIRRORED_REPEAT,
      },
      {
        type: 'i',
        target: gl.TEXTURE_2D,
        name: gl.TEXTURE_MIN_FILTER,
        value: gl.LINEAR,
      },
      {
        type: 'i',
        target: gl.TEXTURE_2D,
        name: gl.TEXTURE_MAG_FILTER,
        value: gl.LINEAR,
      },
    ];
    this._glTexture = undefined;
    this.width = opts.width || 2;
    this.height = opts.height || 2;
    if (opts.image) this.setImage(opts.image);
    Object.defineProperty(this, 'glTexture', { get: this.getGlTexture });
  }

  setParams(params) {
    var gl = this.gl;
    this.params = params;
    for (var i = 0; i < params.length; i++) {
      var param = params[i];
      gl['texParameter' + param.type](param.target, param.name, param.value);
    }
    return this;
  }

  setImage(image) {
    //console.info('Texture.setImage(image);');
    this.image = image;
    this.width = image.width;
    this.height = image.height;
    this.bindTexture();
    return this;
  }

  bindTexture() {
    var gl = this.gl;
    if (this._glTexture === undefined) this._glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._glTexture);
    if (this.image) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.image
      );
    } else {
      if (this.data === undefined) {
        this.data = new Uint8Array(this.width * this.height * 4);
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.data
      );
    }
    this.setParams(this.params);
  }

  getGlTexture() {
    //console.info('Texture.getGlTexture();');
    if (this._glTexture === undefined) this.bindTexture();
    return this._glTexture;
  }

  getFramebuffer() {
    var gl = this.gl;
    if (this.framebuffer === undefined) {
      this.framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.getTexture(),
        0
      );
    }
    return this.framebuffer;
  }

  bindFramebuffer() {
    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.getFramebuffer());
    gl.viewport(0, 0, this.width, this.height);
  }

  unbindFramebuffer() {
    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  setData(data) {
    var gl = this.gl;
    this.data = data || this.data;
    gl.bindTexture(gl.TEXTURE_2D, this.getTexture());
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.data
    );
    if (gl.framebuffer)
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.getTexture(),
        0
      );
  }

  getTexture(): WebGLTexture {}

  getData() {
    var gl = this.gl;
    this.bindFramebuffer();
    gl.readPixels(
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.data
    );
    return this.data;
  }
}
