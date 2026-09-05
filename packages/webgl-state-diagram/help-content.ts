import type { WebGLResourceKind } from './gl-debug-wrapper';

/** One structured section in the inspector's built-in documentation. */
export interface WebGLHelpSection {
  readonly heading?: string;
  readonly body: string;
  readonly bullets?: readonly string[];
  readonly code?: string;
}

/** Documentation displayed by the inspector help dialog. */
export interface WebGLHelpArticle {
  readonly title: string;
  readonly intro: string;
  readonly sections: readonly WebGLHelpSection[];
}

/** Built-in documentation for the diagram, state groups, and WebGL object types. */
export const WEBGL_HELP = {
  overview: {
    title: 'How to read this diagram',
    intro:
      'WebGL draw calls consume a large collection of mutable state. This view reads that state from the real context and connects each binding to the object it currently references.',
    sections: [
      {
        heading: 'Lines and arrows',
        body: 'A solid arrow is a direct WebGL binding or object attachment. A dotted arrow records an indirect relationship observed at draw time, such as a program using a vertex array or writing to a framebuffer.',
        bullets: [
          'The arrow points toward the object being referenced.',
          'Colors identify the target object type.',
          'The default graph hides allocated objects that have no captured relationship. Show unbound reveals them.'
        ]
      },
      {
        heading: 'Live capture',
        body: 'Pause freezes the diagram, not the application. Capture now reads the context immediately. A fast multi-pass renderer usually leaves the state from its final pass visible, while draw-time dotted links preserve relationships seen in earlier passes.'
      },
      {
        heading: 'What gets tracked',
        body: 'The inspector tracks WebGL 1 and WebGL 2 calls, global state, texture units, vertex attributes, indexed buffers, object setup calls, attachments, shader programs, and recent activity. Calls made before instrumentation cannot be reconstructed.'
      },
      {
        heading: 'Context help',
        body: 'Click any outlined label or question mark for the relevant state or object documentation. Resource panels are grouped by WebGL subsystem, such as vertex input, shader programs, textures, and framebuffer attachments. Drag the empty grid to pan and use the wheel to zoom around the pointer. Drag a panel by its title. Fit frames every group, while Reset nodes returns panels to their generated positions.'
      }
    ]
  },
  state: {
    title: 'WebGL state value',
    intro: 'This value comes from getParameter on the inspected context.',
    sections: [
      {
        body: 'Most WebGL calls configure state for a later clear or draw. Binding values point at object panels. Null bindings refer to the default WebGL object, the canvas, or no object, depending on the binding point.'
      }
    ]
  },
  common: {
    title: 'Common state',
    intro: 'The bindings and dimensions consulted by most draw calls.',
    sections: [
      {
        body: 'The current program supplies executable shaders. The current vertex array supplies attribute bindings. Framebuffer bindings select the draw destination and read source. ARRAY_BUFFER_BINDING is a temporary editing binding used by buffer and attribute setup calls.'
      }
    ]
  },
  clear: {
    title: 'Clear state',
    intro: 'Values and write masks used by clear and clearBuffer calls.',
    sections: [
      {
        body: 'A clear still respects the relevant write mask. For example, depthMask(false) prevents clear from changing the depth buffer.'
      }
    ]
  },
  depth: {
    title: 'Depth state',
    intro: 'Controls depth testing, accepted depth values, and depth-buffer writes.',
    sections: [
      {
        body: 'DEPTH_TEST decides whether fragments compare against the depth buffer. DEPTH_FUNC selects the comparison. DEPTH_WRITEMASK controls whether passing fragments update the buffer.'
      }
    ]
  },
  blend: {
    title: 'Blend state',
    intro: 'Combines a fragment shader output with the color already stored in the draw buffer.',
    sections: [
      {
        body: 'Separate RGB and alpha equations use the source and destination factors shown here. Transparent materials commonly enable blending and use SRC_ALPHA with ONE_MINUS_SRC_ALPHA.'
      }
    ]
  },
  stencil: {
    title: 'Stencil state',
    intro: 'Controls stencil tests and the operations applied after stencil and depth outcomes.',
    sections: [
      {
        body: 'WebGL stores separate front and back stencil functions, references, masks, and operations. The visible values are the current settings, even when STENCIL_TEST is disabled.'
      }
    ]
  },
  raster: {
    title: 'Raster state',
    intro: 'Controls face culling, scissoring, polygon offset, line width, and rasterization.',
    sections: [
      {
        body: 'These values decide which primitives reach fragment processing and which region of the draw target may change.'
      }
    ]
  },
  multisample: {
    title: 'Multisample state',
    intro: 'Controls sample coverage and alpha-to-coverage for multisampled draw targets.',
    sections: [
      {
        body: 'SAMPLES and SAMPLE_BUFFERS describe the current draw target. Coverage settings can reject individual samples before depth, stencil, and blending finish.'
      }
    ]
  },
  'transform-feedback': {
    title: 'Transform feedback state',
    intro: 'Captures selected vertex shader outputs into indexed buffer bindings.',
    sections: [
      {
        body: 'A transform feedback object stores its buffer bindings. ACTIVE and PAUSED report whether capture is running. RASTERIZER_DISCARD can skip fragment processing while capture continues.',
        code: `gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, outputBuffer);
gl.beginTransformFeedback(gl.TRIANGLES);`
      }
    ]
  },
  'read-draw-buffers': {
    title: 'Read and draw buffers',
    intro: 'Selects color attachments used for pixel reads and fragment outputs.',
    sections: [
      {
        body: 'READ_BUFFER selects one color source. DRAW_BUFFER0 and later entries route fragment outputs to color attachments. The default framebuffer uses BACK rather than COLOR_ATTACHMENT0.'
      }
    ]
  },
  'pixel-store': {
    title: 'Pixel storage',
    intro: 'Controls byte alignment and layout when pixels cross the JavaScript and WebGL boundary.',
    sections: [
      {
        body: 'Pack values affect readPixels. Unpack values affect texture uploads. Row length, image height, and skip values are WebGL 2 features used for sub-regions and layered data.'
      }
    ]
  },
  'texture-units': {
    title: 'Texture units',
    intro: 'Programs refer to textures indirectly through numbered texture units.',
    sections: [
      {
        body: 'activeTexture selects the unit modified by bindTexture. Each unit has separate 2D, cube, 3D, and 2D-array binding points. A sampler object can override filtering and wrapping for the whole unit.',
        code: `gl.activeTexture(gl.TEXTURE0 + unit);
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.uniform1i(samplerLocation, unit);`
      }
    ]
  },
  'vertex-attributes': {
    title: 'Vertex array attributes',
    intro: 'Each enabled row tells WebGL how a vertex shader input reads from a buffer.',
    sections: [
      {
        body: 'Size, type, normalization, stride, and offset describe one attribute stream. Divisor zero advances per vertex. A positive divisor advances per instance. Disabled rows use a constant global attribute value instead of a buffer.'
      }
    ]
  },
  'indexed-buffers': {
    title: 'Indexed buffer bindings',
    intro: 'Uniform blocks and transform feedback use numbered buffer binding points.',
    sections: [
      {
        body: 'bindBufferBase binds an entire buffer. bindBufferRange also records a byte offset and size. Programs select uniform-buffer indices with uniformBlockBinding.'
      }
    ]
  },
  calls: {
    title: 'Recent WebGL calls',
    intro: 'The newest calls observed through the proxy appear first.',
    sections: [
      {
        body: 'Arguments are shortened to keep the log readable. WebGL objects use the same generated names as their panels. Failed JavaScript calls include the thrown error; GPU validation errors still require getError or a browser debugger.'
      }
    ]
  },
  canvas: {
    title: 'Default framebuffer',
    intro: "The canvas is WebGL's default draw and read framebuffer.",
    sections: [
      {
        body: 'A null framebuffer binding points here. Drawing to an offscreen framebuffer changes attachments instead. The canvas dimensions also define the initial viewport and scissor box, though applications may override both.'
      }
    ]
  },
  VIEWPORT: {
    title: 'VIEWPORT',
    intro: 'Maps normalized device coordinates to canvas or framebuffer pixels.',
    sections: [{ body: 'The four values are x, y, width, and height.', code: 'gl.viewport(x, y, width, height);' }]
  },
  ARRAY_BUFFER_BINDING: {
    title: 'ARRAY_BUFFER_BINDING',
    intro: 'The buffer selected for general buffer uploads and vertex attribute setup.',
    sections: [
      {
        body: 'vertexAttribPointer copies this binding into the current vertex array attribute. Changing ARRAY_BUFFER_BINDING afterward does not change an already configured attribute.',
        code: `gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);`
      }
    ]
  },
  CURRENT_PROGRAM: {
    title: 'CURRENT_PROGRAM',
    intro: 'The linked shader program used by draw calls and uniform setters.',
    sections: [
      {
        body: 'Set it with useProgram. Passing null leaves no executable program bound.',
        code: 'gl.useProgram(program);'
      }
    ]
  },
  VERTEX_ARRAY_BINDING: {
    title: 'VERTEX_ARRAY_BINDING',
    intro: 'The vertex array that owns attribute and element-array bindings.',
    sections: [
      {
        body: 'Passing null binds the default vertex array. WebGL 1 exposes additional vertex arrays through OES_vertex_array_object.',
        code: 'gl.bindVertexArray(vertexArray);'
      }
    ]
  },
  RENDERBUFFER_BINDING: {
    title: 'RENDERBUFFER_BINDING',
    intro: 'The renderbuffer modified by storage calls.',
    sections: [
      {
        body: 'Framebuffer attachment calls reference the renderbuffer object directly.',
        code: 'gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);'
      }
    ]
  },
  DRAW_FRAMEBUFFER_BINDING: {
    title: 'DRAW_FRAMEBUFFER_BINDING',
    intro: 'The framebuffer that receives clears, draws, and blit destinations.',
    sections: [
      { body: 'A null value means the canvas.', code: 'gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);' }
    ]
  },
  READ_FRAMEBUFFER_BINDING: {
    title: 'READ_FRAMEBUFFER_BINDING',
    intro: 'The framebuffer used by readPixels, copy operations, and blit sources.',
    sections: [
      { body: 'A null value means the canvas.', code: 'gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);' }
    ]
  },
  ACTIVE_TEXTURE: {
    title: 'ACTIVE_TEXTURE',
    intro: 'The texture unit changed by subsequent texture binding and parameter calls.',
    sections: [{ body: 'The enum TEXTURE0 means unit zero.', code: 'gl.activeTexture(gl.TEXTURE0 + unit);' }]
  },
  'resource-buffer': {
    title: 'Buffer object',
    intro: 'Buffers store vertex data, indices, uniform blocks, transform feedback output, and pixel-transfer data.',
    sections: [
      {
        body: 'The target passed to bindBuffer selects how later calls interpret the buffer. Vertex arrays retain attribute and element-array buffer references.'
      }
    ]
  },
  'resource-framebuffer': {
    title: 'Framebuffer object',
    intro: 'A framebuffer groups texture and renderbuffer attachments into an offscreen draw or read target.',
    sections: [
      {
        body: 'Attachment arrows are direct references. A framebuffer must have compatible, complete attachments before drawing succeeds.'
      }
    ]
  },
  'resource-program': {
    title: 'Program object',
    intro: 'A program links vertex and fragment shaders and owns uniform values and interface metadata.',
    sections: [
      {
        body: 'Shader arrows are direct. Dotted draw arrows show the vertex array and output framebuffer observed when this program last drew.'
      }
    ]
  },
  'resource-renderbuffer': {
    title: 'Renderbuffer object',
    intro: 'Renderbuffers provide framebuffer storage optimized for rendering rather than sampling.',
    sections: [
      {
        body: 'Multisampled renderbuffers record their sample count. They commonly store depth, stencil, or multisampled color data.'
      }
    ]
  },
  'resource-sampler': {
    title: 'Sampler object',
    intro:
      'A sampler overrides texture filtering, wrapping, comparison, and level-of-detail parameters for one texture unit.',
    sections: [
      {
        body: 'Bind samplers by texture-unit index with bindSampler. Passing null makes the bound texture supply its own parameters.'
      }
    ]
  },
  'resource-shader': {
    title: 'Shader object',
    intro: 'A shader stores GLSL source and its compile result before programs link it.',
    sections: [
      {
        body: 'deleteShader may only request deletion. A linked program can retain the compiled shader, so the diagram keeps that panel while a program still references it.'
      }
    ]
  },
  'resource-texture': {
    title: 'Texture object',
    intro: 'Textures store image or arbitrary typed data across mip levels, faces, and layers.',
    sections: [
      {
        body: 'Dimensions come from image, sub-image, or immutable-storage calls. Filtering and wrapping parameters determine how shader sampling reads that storage.'
      }
    ]
  },
  'resource-transform-feedback': {
    title: 'Transform feedback object',
    intro: 'A transform feedback object stores indexed output-buffer bindings.',
    sections: [
      {
        body: 'A program declares which vertex shader varyings are captured and whether outputs are interleaved or written to separate buffers.'
      }
    ]
  },
  'resource-vertex-array': {
    title: 'Vertex array object',
    intro: 'A vertex array owns attribute formats, attribute buffers, divisors, and the element-array buffer.',
    sections: [
      {
        body: 'Each attribute and element-array arrow is a direct stored reference to a buffer. ARRAY_BUFFER_BINDING itself is not stored as part of the vertex array.'
      }
    ]
  },
  'resource-query': {
    title: 'Query object',
    intro: 'Queries measure asynchronous GPU results such as occlusion or transform-feedback primitive counts.',
    sections: [{ body: 'A result becomes available after the GPU reaches the matching endQuery call.' }]
  },
  'resource-sync': {
    title: 'Sync object',
    intro: 'A fence sync marks a point in the GPU command stream.',
    sections: [{ body: 'clientWaitSync and waitSync coordinate later CPU or GPU work with that point.' }]
  },
  'resource-unknown': {
    title: 'WebGL object',
    intro: 'The inspector observed an object but could not classify its WebGL type.',
    sections: [{ body: 'This usually means an extension returned an object type the inspector does not know yet.' }]
  }
} as const satisfies Record<string, WebGLHelpArticle>;

/** A valid built-in help article key. */
export type WebGLHelpTopic = keyof typeof WEBGL_HELP;

/** Returns the best documentation topic for a state row. */
export function helpTopicForState(key: string): WebGLHelpTopic {
  return key in WEBGL_HELP ? (key as WebGLHelpTopic) : 'state';
}

/** Returns the documentation topic for a WebGL resource kind. */
export function helpTopicForResource(kind: WebGLResourceKind): WebGLHelpTopic {
  const topic = `resource-${kind}`;
  return topic in WEBGL_HELP ? (topic as WebGLHelpTopic) : 'resource-unknown';
}
