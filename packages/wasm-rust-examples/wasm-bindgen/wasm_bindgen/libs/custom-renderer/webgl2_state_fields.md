
## **Comprehensive List of WebGL2 State Fields for State Diffing**

### **1. Shader Program State**

**State Field:**

- **Current Shader Program**

**Representation:**

```rust
current_program: Option<Rc<ShaderProgram>>,
```

**Explanation:**

- **Purpose**: Tracks the shader program currently in use to avoid unnecessary calls to `gl.useProgram()`.
- **Comparison**: Use pointer comparison (e.g., `Rc::ptr_eq`) to check if the desired shader program differs from the current one.

---

### **2. Buffer Bindings**

**State Fields:**

- **Array Buffer Binding** (`GL_ARRAY_BUFFER`)
- **Element Array Buffer Binding** (`GL_ELEMENT_ARRAY_BUFFER`)
- **Uniform Buffer Bindings** (`GL_UNIFORM_BUFFER`)
- **Transform Feedback Buffer Bindings** (`GL_TRANSFORM_FEEDBACK_BUFFER`)
- **Shader Storage Buffer Bindings** (`GL_SHADER_STORAGE_BUFFER`)
- **Atomic Counter Buffer Bindings** (`GL_ATOMIC_COUNTER_BUFFER`)

**Representation:**

```rust
array_buffer_binding: Option<Rc<Buffer>>,
element_array_buffer_binding: Option<Rc<Buffer>>,
uniform_buffer_bindings: HashMap<u32, Option<Rc<Buffer>>>, // Binding point to buffer
// Similarly for other buffer types
```

**Explanation:**

- **Purpose**: Keeps track of the buffers currently bound to prevent redundant calls to `gl.bindBuffer()` and associated functions.
- **Comparison**: Compare the desired buffer bindings with the current ones using pointer comparison.

---

### **3. Vertex Array Object (VAO) Binding**

**State Field:**

- **Current VAO Binding**

**Representation:**

```rust
vertex_array_object_binding: Option<Rc<VertexArrayObject>>,
```

**Explanation:**

- **Purpose**: Avoids unnecessary calls to `gl.bindVertexArray()` by tracking the currently bound VAO.
- **Comparison**: Use pointer comparison to detect changes.

---

### **4. Texture Units and Bindings**

**State Fields:**

- **Active Texture Unit**
- **Textures Bound to Each Texture Unit**

**Representation:**

```rust
active_texture_unit: TextureUnit,
texture_unit_bindings: HashMap<TextureUnit, (Option<Rc<Texture>>, TextureTarget)>,
```

**Explanation:**

- **Purpose**: Tracks the active texture unit and the textures bound to each unit to minimize calls to `gl.activeTexture()` and `gl.bindTexture()`.
- **Comparison**: Compare both the texture and its target for each unit.

---

### **5. Framebuffer Bindings**

**State Fields:**

- **Draw Framebuffer Binding** (`GL_DRAW_FRAMEBUFFER`)
- **Read Framebuffer Binding** (`GL_READ_FRAMEBUFFER`)

**Representation:**

```rust
draw_framebuffer_binding: Option<Rc<Framebuffer>>,
read_framebuffer_binding: Option<Rc<Framebuffer>>,
```

**Explanation:**

- **Purpose**: Manages the current framebuffer bindings to avoid unnecessary calls to `gl.bindFramebuffer()`.
- **Comparison**: Use pointer comparison.

---

### **6. Enabled Capabilities**

**State Field:**

- **Enabled Capabilities Set**

**Representation:**

```rust
enabled_capabilities: HashSet<Capability>,
```

**Explanation:**

- **Purpose**: Tracks which WebGL capabilities are currently enabled (e.g., `GL_BLEND`, `GL_DEPTH_TEST`) to prevent redundant calls to `gl.enable()` and `gl.disable()`.
- **Comparison**: Compare the desired set of enabled capabilities with the current set.

---

### **7. Render States**

#### **a. Blending State**

**State Fields:**

- **Blend Enabled**
- **Blend Function**: Source and destination factors
- **Blend Equation**
- **Blend Color**

**Representation:**

```rust
blend_enabled: bool,
blend_func: (BlendFactor, BlendFactor),
blend_equation: BlendEquation,
blend_color: [f32; 4],
```

**Explanation:**

- **Purpose**: Controls how fragments are blended with the framebuffer.
- **Comparison**: Compare each blending parameter individually.

#### **b. Depth Test State**

**State Fields:**

- **Depth Test Enabled**
- **Depth Function**
- **Depth Mask**

**Representation:**

```rust
depth_test_enabled: bool,
depth_func: DepthFunction,
depth_mask: bool,
```

**Explanation:**

- **Purpose**: Manages depth testing to determine fragment visibility.
- **Comparison**: Check each parameter for differences.

#### **c. Stencil Test State**

**State Fields:**

- **Stencil Test Enabled**
- **Stencil Function**: Function, reference value, and mask
- **Stencil Operations**: Fail, depth fail, depth pass operations
- **Stencil Mask**

**Representation:**

```rust
stencil_test_enabled: bool,
stencil_func: (StencilFunction, i32, u32),
stencil_op: (StencilOp, StencilOp, StencilOp),
stencil_mask: u32,
```

**Explanation:**

- **Purpose**: Manages stencil testing for complex rendering effects.
- **Comparison**: Compare each parameter individually.

#### **d. Face Culling State**

**State Fields:**

- **Cull Face Enabled**
- **Cull Face Mode**
- **Front Face Direction**

**Representation:**

```rust
cull_face_enabled: bool,
cull_face_mode: CullFaceMode,
front_face: FrontFaceDirection,
```

**Explanation:**

- **Purpose**: Controls which faces are culled during rendering.
- **Comparison**: Compare each parameter individually.

#### **e. Polygon Offset State**

**State Fields:**

- **Polygon Offset Fill Enabled**
- **Polygon Offset Factors**: Factor and units

**Representation:**

```rust
polygon_offset_fill_enabled: bool,
polygon_offset: (f32, f32),
```

**Explanation:**

- **Purpose**: Adjusts the depth values of polygons to prevent z-fighting.
- **Comparison**: Check for differences in the enabled state and factors.

---

### **8. Viewport and Scissor State**

**State Fields:**

- **Viewport**
- **Scissor Test Enabled**
- **Scissor Box**

**Representation:**

```rust
viewport: [i32; 4],
scissor_test_enabled: bool,
scissor_box: [i32; 4],
```

**Explanation:**

- **Purpose**: Defines the drawable area of the framebuffer.
- **Comparison**: Compare the arrays element-wise.

---

### **9. Color, Depth, and Stencil Masks**

**State Fields:**

- **Color Mask**
- **Depth Mask**
- **Stencil Mask**

**Representation:**

```rust
color_mask: [bool; 4],
depth_mask: bool,
stencil_mask: u32,
```

**Explanation:**

- **Purpose**: Controls writing to the framebuffer and buffers.
- **Comparison**: Compare each mask component individually.

---

### **10. Clear Values**

**State Fields:**

- **Clear Color**
- **Clear Depth**
- **Clear Stencil**

**Representation:**

```rust
clear_color: [f32; 4],
clear_depth: f32,
clear_stencil: i32,
```

**Explanation:**

- **Purpose**: Values used when clearing buffers.
- **Comparison**: Compare each value.

---

### **11. Line Width**

**State Field:**

- **Line Width**

**Representation:**

```rust
line_width: f32,
```

**Explanation:**

- **Purpose**: Specifies the width of lines.
- **Comparison**: Check for differences.

---

### **12. Dithering**

**State Field:**

- **Dither Enabled**

**Representation:**

```rust
dither_enabled: bool,
```

**Explanation:**

- **Purpose**: Controls whether dithering is applied.
- **Comparison**: Compare the boolean value.

---

### **13. Sample Coverage**

**State Fields:**

- **Sample Coverage Enabled**
- **Sample Coverage Value**
- **Sample Coverage Invert**

**Representation:**

```rust
sample_coverage_enabled: bool,
sample_coverage_value: f32,
sample_coverage_invert: bool,
```

**Explanation:**

- **Purpose**: Manages multisampling behavior.
- **Comparison**: Compare each parameter.

---

### **14. Rasterizer Discard**

**State Field:**

- **Rasterizer Discard Enabled**

**Representation:**

```rust
rasterizer_discard_enabled: bool,
```

**Explanation:**

- **Purpose**: Controls whether primitives are discarded before rasterization.
- **Comparison**: Compare the boolean value.

---

### **15. Hint States**

**State Field:**

- **Fragment Shader Derivative Hint**

**Representation:**

```rust
fragment_shader_derivative_hint: HintMode,
```

**Explanation:**

- **Purpose**: Provides a hint for quality and performance trade-offs.
- **Comparison**: Compare the `HintMode` value.

---

### **16. Pixel Store Parameters**

**State Fields:**

- **Unpack Alignment**
- **Pack Alignment**

**Representation:**

```rust
unpack_alignment: i32,
pack_alignment: i32,
```

**Explanation:**

- **Purpose**: Affects how pixel data is read or written.
- **Comparison**: Compare the integer values.

---

### **17. Other States**

**State Fields:**

- **Color Logic Op Enabled**
- **Logic Op Mode**

**Representation:**

```rust
color_logic_op_enabled: bool,
logic_op_mode: LogicOp,
```

**Explanation:**

- **Purpose**: Manages logical pixel operations.
- **Comparison**: Compare each parameter.
