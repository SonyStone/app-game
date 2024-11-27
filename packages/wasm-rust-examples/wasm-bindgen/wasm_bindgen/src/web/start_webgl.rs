use lyon::tessellation::VertexBuffers;
use wasm_bindgen::prelude::*;
use web_sys::{console, WebGl2RenderingContext, WebGlProgram, WebGlShader};
use wgsl_to_glsl_macro::make_naga_module;

use crate::{
    test_lyon::{test_geometry, MyVertex},
    web::{
        camera_2d::{any_as_u8_slice, Camera2D},
        event_handle::JsCallback,
    },
};

#[derive(Debug)]
enum BindingRegister {
    UniformBuffers,
    StorageBuffers,
    Textures,
    Images,
}
#[wasm_bindgen]
pub struct AppWebGL {
    canvas: web_sys::HtmlCanvasElement,
    gl: WebGl2RenderingContext,
    camera: Camera2D,
    is_panning: bool,
    last_pointer_position: Option<(f32, f32)>,
    geometry: Option<VertexBuffers<MyVertex, u16>>,
    camera_uniform_buffer: Option<web_sys::WebGlBuffer>,
}

#[wasm_bindgen]
impl AppWebGL {
    pub fn new(canvas: web_sys::HtmlCanvasElement) -> Result<Self, JsValue> {
        let gl = canvas
            .get_context("webgl2")?
            .unwrap()
            .dyn_into::<WebGl2RenderingContext>()?;

        Ok(Self {
            canvas: canvas.clone(),
            gl,
            camera: Camera2D::new(canvas.width() as f32, canvas.height() as f32),
            is_panning: false,
            last_pointer_position: None,
            geometry: None,
            camera_uniform_buffer: None,
        })
    }

    pub fn init(&mut self) {
        let callback = JsCallback::register(
            &self.canvas.clone(),
            "click",
            false,
            |_event: web_sys::MouseEvent| {
                console::log_1(&"Click".into());
            },
        );

        std::mem::forget(callback);

        let data = make_naga_module!("src/web/start_webgl.wgsl");

        let (vert_shader, frag_shader) =
            compile_shader_pair(&self.gl, (data.vertex, data.fragment));

        let program = link_program(&self.gl, &vert_shader, &frag_shader).unwrap();
        self.gl.use_program(Some(&program));

        // ! Uniform Blocks for Camera2d
        {
            // 1. Connect to each uniform block
            let uniform_block_index = self
                .gl
                .get_uniform_block_index(&program, data.transforms_uniform_block_name);

            self.gl.uniform_block_binding(
                &program,
                uniform_block_index,
                data.transforms_uniform_binding,
            );

            // 2. Connect to each buffer
            let uniform_buffer = self.gl.create_buffer().unwrap();
            self.gl.bind_buffer(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                Some(&uniform_buffer),
            );

            self.gl.buffer_data_with_u8_array(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                self.camera.get_transforms().as_bytes(),
                WebGl2RenderingContext::DYNAMIC_DRAW,
            );
            self.gl.bind_buffer_base(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                data.transforms_uniform_binding,
                Some(&uniform_buffer),
            );

            self.camera_uniform_buffer = Some(uniform_buffer);
        }
        {
            let uniform_block_index = self
                .gl
                .get_uniform_block_index(&program, data.color_uniform_block_name);

            self.gl.uniform_block_binding(
                &program,
                uniform_block_index,
                data.color_uniform_binding,
            );
            let uniform_buffer = self.gl.create_buffer().unwrap();
            self.gl.bind_buffer(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                Some(&uniform_buffer),
            );

            #[repr(C)]
            struct Color {
                r: f32,
                g: f32,
                b: f32,
                a: f32,
            }

            impl Color {
                pub fn as_bytes(&self) -> &[u8] {
                    unsafe { any_as_u8_slice(self) }
                }
            }

            self.gl.buffer_data_with_u8_array(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                Color {
                    r: 0.7,
                    g: 0.7,
                    b: 1.0,
                    a: 1.0,
                }
                .as_bytes(),
                WebGl2RenderingContext::DYNAMIC_DRAW,
            );
            self.gl.bind_buffer_base(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                data.color_uniform_binding,
                Some(&uniform_buffer),
            );
        }

        let geometry = test_geometry();

        let vertices = geometry
            .vertices
            .iter()
            .flat_map(|vertex| vertex.position)
            .collect::<Vec<f32>>();

        let vao = self
            .gl
            .create_vertex_array()
            .ok_or("Could not create vertex array object")
            .unwrap();
        self.gl.bind_vertex_array(Some(&vao));

        {
            let buffer = self.gl.create_buffer().unwrap();
            self.gl
                .bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));

            // Note that `Float32Array::view` is somewhat dangerous (hence the
            // `unsafe`!). This is creating a raw view into our module's
            // `WebAssembly.Memory` buffer, but if we allocate more pages for ourself
            // (aka do a memory allocation in Rust) it'll cause the buffer to change,
            // causing the `Float32Array` to be invalid.
            //
            // As a result, after `Float32Array::view` we have to be very careful not to
            // do any memory allocations before it's dropped.

            self.gl.buffer_data_with_u8_array(
                WebGl2RenderingContext::ARRAY_BUFFER,
                to_u8(&vertices),
                WebGl2RenderingContext::STATIC_DRAW,
            );
        }

        self.gl.vertex_attrib_pointer_with_i32(
            data.position_attribute_location,
            2,
            WebGl2RenderingContext::FLOAT,
            false,
            0,
            0,
        );
        self.gl
            .enable_vertex_attrib_array(data.position_attribute_location);

        {
            let index_buffer = self
                .gl
                .create_buffer()
                .ok_or("Failed to create buffer")
                .unwrap();
            self.gl.bind_buffer(
                WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
                Some(&index_buffer),
            );

            self.gl.buffer_data_with_u8_array(
                WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
                to_u8(&geometry.indices),
                WebGl2RenderingContext::STATIC_DRAW,
            );
        };

        self.geometry = Some(geometry);
    }

    pub fn update_camera(&mut self) {
        if let Some(camera_uniform_buffer) = &self.camera_uniform_buffer {
            self.gl.bind_buffer(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                Some(camera_uniform_buffer),
            );

            self.gl.buffer_data_with_u8_array(
                WebGl2RenderingContext::UNIFORM_BUFFER,
                self.camera.get_transforms().as_bytes(),
                WebGl2RenderingContext::DYNAMIC_DRAW,
            );
        }
    }

    pub fn render(&mut self) -> Result<(), JsValue> {
        self.gl.viewport(
            0,
            0,
            self.canvas.width() as i32,
            self.canvas.height() as i32,
        );

        self.gl.clear_color(0.0, 0.0, 0.0, 1.0);
        self.gl.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

        self.update_camera();

        if let Some(geometry) = &self.geometry {
            self.gl.draw_elements_with_i32(
                WebGl2RenderingContext::TRIANGLES,
                geometry.indices.len() as i32,
                WebGl2RenderingContext::UNSIGNED_SHORT,
                0,
            );
        }

        Ok(())
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.camera.resize(width as f32, height as f32);
        self.render().unwrap();
    }

    pub fn canvas(&self) -> web_sys::HtmlCanvasElement {
        self.canvas.clone()
    }

    pub fn context(&self) -> WebGl2RenderingContext {
        self.gl.clone()
    }

    pub fn on_pointer_down(&mut self, event: web_sys::PointerEvent) {
        // console::log_1(&format!("Pointer down {:?}", event.type_()).into());
        self.is_panning = true;
        self.last_pointer_position = Some((event.client_x() as f32, event.client_y() as f32));
        self.render().unwrap();
    }

    pub fn on_pointer_move(&mut self, event: web_sys::PointerEvent) {
        if self.is_panning {
            if let Some((last_x, last_y)) = self.last_pointer_position {
                let dx = event.client_x() as f32 - last_x;
                let dy = event.client_y() as f32 - last_y;
                self.camera.pan(-dx, -dy);
                self.render().unwrap();
                self.last_pointer_position =
                    Some((event.client_x() as f32, event.client_y() as f32));
            }
        }
    }

    pub fn on_pointer_up(&mut self, _event: web_sys::PointerEvent) {
        self.is_panning = false;
        self.last_pointer_position = None;
        self.render().unwrap();
    }

    pub fn on_pointer_enter(&mut self, _event: web_sys::PointerEvent) {
        self.canvas.focus().unwrap();
    }

    pub fn on_pointer_leave(&mut self, _event: web_sys::PointerEvent) {
        self.canvas.blur().unwrap();
    }

    pub fn on_keydown(&mut self, event: web_sys::KeyboardEvent) {
        console::log_1(&format!("Key down {:?}", event.key()).into());
    }

    pub fn on_wheel(&mut self, event: web_sys::WheelEvent) {
        let delta = -event.delta_y() as f32;
        self.camera.zoom(delta);
        self.render().unwrap();
    }
}

pub fn compile_shader_pair(
    gl: &WebGl2RenderingContext,
    (vert_source, frag_source): (&str, &str),
) -> (WebGlShader, WebGlShader) {
    let vert_shader =
        compile_shader(gl, WebGl2RenderingContext::VERTEX_SHADER, vert_source).unwrap();

    let frag_shader =
        compile_shader(gl, WebGl2RenderingContext::FRAGMENT_SHADER, frag_source).unwrap();

    (vert_shader, frag_shader)
}

pub fn compile_shader(
    gl: &WebGl2RenderingContext,
    shader_type: u32,
    source: &str,
) -> Result<WebGlShader, String> {
    let shader = gl
        .create_shader(shader_type)
        .ok_or_else(|| String::from("Unable to create shader object"))?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);

    if gl
        .get_shader_parameter(&shader, WebGl2RenderingContext::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(gl
            .get_shader_info_log(&shader)
            .unwrap_or_else(|| String::from("Unknown error creating shader")))
    }
}

pub fn link_program(
    gl: &WebGl2RenderingContext,
    vert_shader: &WebGlShader,
    frag_shader: &WebGlShader,
) -> Result<WebGlProgram, String> {
    let program = gl
        .create_program()
        .ok_or_else(|| String::from("Unable to create shader object"))?;

    gl.attach_shader(&program, vert_shader);
    gl.attach_shader(&program, frag_shader);
    gl.link_program(&program);

    if gl
        .get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(program)
    } else {
        Err(gl
            .get_program_info_log(&program)
            .unwrap_or_else(|| String::from("Unknown error creating program object")))
    }
}

fn to_u8<T>(vec: &[T]) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(
            vec.as_ptr() as *const u8,
            vec.len() * std::mem::size_of::<f32>(),
        )
    }
}
