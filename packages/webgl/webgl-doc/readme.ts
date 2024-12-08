function webgl(gl: WebGL2RenderingContext) {
  // ! textures
  {
    gl.activeTexture;
    gl.bindTexture;
    gl.compressedTexImage2D;
    gl.compressedTexSubImage2D;

    // current WebGLFramebuffer to texture
    gl.copyTexImage2D;
    gl.copyTexSubImage2D;

    gl.createTexture;
    gl.deleteTexture;

    // attaches a texture to a WebGLFramebuffer
    gl.framebufferTexture2D;

    gl.generateMipmap;
    gl.getTexParameter;
    gl.isTexture;
    gl.pixelStorei;
    gl.texImage2D;
    gl.texParameteri;
    gl.texSubImage2D;

    // texture 3d
    {
      gl.compressedTexSubImage3D;
      gl.copyTexSubImage3D;
      gl.texImage3D;
      gl.texStorage3D;
      gl.texSubImage3D;
    }

    // attaches a layer of texture to a WebGLFramebuffer
    // for 3d textures and 2d array textures
    gl.framebufferTextureLayer;

    gl.texStorage2D;
  }

  // ! shader program
  {
    gl.attachShader;
    gl.bindAttribLocation;
    gl.compileShader;
    gl.createProgram;
    gl.createShader;
    gl.deleteProgram;
    gl.deleteShader;
    gl.detachShader;

    gl.getAttachedShaders; // not very useful, for debugging mostly

    gl.getActiveAttrib; // not very useful, for debugging or generic library

    // connect to attributes
    gl.getAttribLocation;

    gl.getProgramInfoLog; // for debugging mostly
    gl.getProgramParameter; // for debugging mostly
    gl.getShaderInfoLog;
    gl.getShaderParameter;
    gl.getShaderPrecisionFormat; // not very useful
    gl.getShaderSource; // not very useful

    gl.isProgram;
    gl.isShader;
    gl.linkProgram;
    gl.shaderSource;

    gl.useProgram;
    gl.validateProgram;

    gl.getFragDataLocation;

    // !uniforms
    {
      gl.getActiveUniform; // not very useful, for debugging or generic library

      // uniforms are mostly always known in advance
      gl.getUniform;
      gl.getUniformLocation;

      // set uniforms
      {
        // uniform vectors and scalcars
        gl.uniform1f;
        gl.uniform1fv;
        gl.uniform1i;
        // ...etc

        // uniform matrices
        // matrices are only float32
        gl.uniformMatrix2fv;
        gl.uniformMatrix3fv;
        gl.uniformMatrix4fv;

        // I guess thay add more functions in WebGL2
        gl.uniform1ui;
        gl.uniform2ui;
        // ...etc

        // and more matrix functions
        gl.uniformMatrix2fv;
        gl.uniformMatrix3x2fv;
        // ...etc
      }

      // part of niform buffer objects (UBOs
      {
        gl.getActiveUniformBlockName;
        gl.getActiveUniformBlockParameter;
      }

      gl.getActiveUniforms;
      gl.getUniformBlockIndex;
      gl.getUniformIndices;

      gl.uniformBlockBinding;
    }
  }

  // ! WebGLBuffer
  {
    gl.bindBuffer;
    gl.bufferData;
    gl.bufferSubData;
    gl.createBuffer;
    gl.deleteBuffer;

    gl.getBufferParameter; // not very useful, for debugging mostly
    gl.isBuffer; // not very useful

    gl.bindBufferBase; // WebGL2
    gl.bindBufferRange; // WebGL2

    gl.copyBufferSubData; // WebGL2

    // write to a ArrayBuffer or SharedArrayBuffer
    gl.getBufferSubData;

    gl.getIndexedParameter;
  }

  // ! WebGLFramebuffer
  // store textures and renderbuffers
  {
    gl.bindFramebuffer;
    gl.checkFramebufferStatus;
    gl.colorMask;
    gl.createFramebuffer;
    gl.deleteFramebuffer;

    gl.getFramebufferAttachmentParameter; // for debugging?
    gl.isFramebuffer; // how is it possable to not know if it is a framebuffer?

    gl.readPixels; // framebuffer into TypedArray?

    gl.blitFramebuffer; // transfers a block of pixels from the read framebuffer to the draw framebuffer

    // need to check where to use those
    {
      gl.clearBufferfv;
      gl.clearBufferiv;
      gl.clearBufferuiv;
      gl.clearBufferfi;
    }

    gl.drawBuffers; // WebGL2

    gl.invalidateFramebuffer;
    gl.invalidateSubFramebuffer;
    gl.readBuffer;

    // ! WEBGLRenderbuffer
    // part of WebGLFramebuffer
    {
      gl.bindRenderbuffer;
      gl.createRenderbuffer;
      gl.deleteRenderbuffer;

      // attaches a WebGLRenderbuffer object to a WebGLFramebuffer object.
      gl.framebufferRenderbuffer;

      gl.getRenderbufferParameter;
      gl.isRenderbuffer;

      gl.renderbufferStorage;

      gl.getInternalformatParameter;
      gl.renderbufferStorageMultisample;
    }
  }

  // ! clear, not shure is it part of Renderbuffer
  {
    gl.clear;
    gl.clearColor;
    gl.clearDepth;
    gl.clearStencil;
  }

  // ! color blend not very usful
  // The blend equation determines how a new pixel is
  // combined with a pixel already in the WebGLFramebuffer.
  {
    gl.blendColor;
    gl.blendEquation;
    gl.blendEquationSeparate;
    gl.blendFunc;
    gl.blendFuncSeparate;
  }

  // not shure of what part is it
  // looks like some global settings
  // ! context parameters
  {
    gl.cullFace;
    gl.depthFunc;
    gl.depthMask;
    gl.depthRange;
    gl.disable; // turn off some features
    gl.enable; // turn on some features

    // may be useful to draw once
    gl.finish; // not useful
    gl.flush; // not useful

    gl.frontFace;

    // context parameters
    gl.getContextAttributes; // useful for debugging

    // I think get extensions will go to the context parameters
    gl.getExtension;

    //? not shure what is it
    gl.getParameter;
    gl.getSupportedExtensions;

    gl.hint; // might be useful
    gl.isContextLost; // for error handling
    gl.isEnabled;
    gl.lineWidth; // depricated?

    // gl.makeXRCompatible; // VR stuff

    gl.polygonOffset;

    gl.sampleCoverage;

    // stencil
    {
      gl.stencilFunc;
      gl.stencilFuncSeparate;
      gl.stencilMask;
      gl.stencilMaskSeparate;
      gl.stencilOp;
      gl.stencilOpSeparate;
    }

    gl.viewport; // should it be part of WEBGLRenderbuffer

    // ! WebGLSync
    {
      gl.clientWaitSync;
      gl.deleteSync;
      gl.fenceSync;
      gl.getSyncParameter;
      gl.isSync;
      gl.waitSync;
    }
  }

  // ! attributes stuff
  {
    gl.disableVertexAttribArray;
    gl.enableVertexAttribArray;

    // connect to attributes
    gl.getAttribLocation;
    gl.getVertexAttrib;
    gl.getVertexAttribOffset;

    // attribute as constant value
    {
      gl.vertexAttrib1f;
      gl.vertexAttrib2f;
      gl.vertexAttrib3f;

      // more functions for WebGL2
      gl.vertexAttribI4i;
      gl.vertexAttribI4ui;
      gl.vertexAttribI4iv;
      gl.vertexAttribI4uiv;
    }

    // attribute as array from array buffer
    {
      gl.vertexAttribPointer; // for float
      gl.vertexAttribIPointer; // for int, new in WebGL2
    }

    // for instanced rendering. Very tricky stuff
    gl.vertexAttribDivisor;
  }

  // ! drawing
  {
    gl.drawArrays;
    gl.drawElements;

    gl.scissor; // ? should it be here?

    gl.drawArraysInstanced;
    gl.drawElementsInstanced;

    gl.drawRangeElements;
  }

  // ! error?
  // separate error handling?
  {
    gl.getError;
  }

  // !? query ? debug stuff?
  {
    gl.beginQuery;
    gl.createQuery;
    gl.deleteQuery;
    gl.endQuery;
    gl.getQuery;
    gl.getQueryParameter;
    gl.isQuery;
  }

  // !? transform feedback ? what is it?
  // some kind of GPU calculations
  // * Particle Systems
  // * Geometry Morphing
  // * Physics Simulations
  // * GPU-based Pathfinding
  // * GPGPU (General Purpose GPU) Programming
  // * Shadow Volume Extrusion
  // * Terrain Generation
  {
    gl.beginTransformFeedback;
    gl.bindTransformFeedback;
    gl.createTransformFeedback;
    gl.deleteTransformFeedback;
    gl.endTransformFeedback;
    gl.getTransformFeedbackVarying;
    gl.isTransformFeedback;
    gl.pauseTransformFeedback;
    gl.resumeTransformFeedback;
    gl.transformFeedbackVaryings;
  }

  // ! Sampler WebGL2
  // part of texture parameters
  // have higher priority than texture parameters
  {
    gl.bindSampler;
    gl.createSampler;
    gl.deleteSampler;
    gl.getSamplerParameter;
    gl.isSampler;
    // sampler parameters
    {
      gl.samplerParameteri;
      gl.samplerParameterf;
    }
  }

  // ! VAO WebGL2
  // it is better to use VAO than to use bindBuffer and vertexAttribPointer
  {
    gl.bindVertexArray;
    gl.createVertexArray;
    gl.deleteVertexArray;
    gl.isVertexArray;
  }
}

// Ok, thats all methods of WebGL2RenderingContext

// WebGLObjects
WebGLBuffer;
WebGLFramebuffer; // can be FRAMEBUFFER, DRAW_FRAMEBUFFER, READ_FRAMEBUFFER
WebGLProgram;
WebGLRenderbuffer;
WebGLShader;
WebGLTexture;
// WebGL2Objects
WebGLQuery;
WebGLSampler;
WebGLSync;
WebGLTransformFeedback;
WebGLVertexArrayObject;

// Should I wrap each of them in a class?
