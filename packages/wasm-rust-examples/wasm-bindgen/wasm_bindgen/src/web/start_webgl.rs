use wasm_bindgen::prelude::*;
use web_sys::{console, WebGl2RenderingContext, WebGlProgram, WebGlShader};
use wgsl_to_glsl_macro::include_wgsl_to_glsl;

use crate::{
    test_lyon::test_geometry,
    web::event_handle::{add_event, EventListenerHandle},
};

#[wasm_bindgen]
pub struct AppWebGL {
    canvas: web_sys::HtmlCanvasElement,
    context: WebGl2RenderingContext,
    on_pointer_down: EventListenerHandle<dyn FnMut(web_sys::PointerEvent)>,
    on_pointer_enter: EventListenerHandle<dyn FnMut(web_sys::PointerEvent)>,
    on_pointer_leave: EventListenerHandle<dyn FnMut(web_sys::PointerEvent)>,
    on_keydown: EventListenerHandle<dyn FnMut(web_sys::KeyboardEvent)>,
}

#[wasm_bindgen]
impl AppWebGL {
    pub fn new(canvas: web_sys::HtmlCanvasElement) -> Result<Self, JsValue> {
        let context = canvas
            .get_context("webgl2")?
            .unwrap()
            .dyn_into::<WebGl2RenderingContext>()?;

        let on_pointer_down = add_event(
            canvas.clone(),
            "pointerdown",
            move |event: web_sys::PointerEvent| {
                console::log_1(&format!("Pointer down {:?}", event.type_()).into());
            },
        );

        let on_pointer_enter = add_event(canvas.clone(), "pointerenter", {
            let canvas = canvas.clone();
            move |event: web_sys::PointerEvent| {
                canvas.focus().unwrap();
                console::log_1(&format!("Pointer over {:?}", event.type_()).into());
            }
        });

        let on_pointer_leave = add_event(canvas.clone(), "pointerleave", {
            let canvas = canvas.clone();
            move |event: web_sys::PointerEvent| {
                canvas.blur().unwrap();
                console::log_1(&format!("Pointer out {:?}", event.type_()).into());
            }
        });

        let on_keydown = add_event(
            canvas.clone(),
            "keydown",
            move |event: web_sys::KeyboardEvent| {
                console::log_1(&format!("Key down {:?}", event.key()).into());
            },
        );

        Ok(Self {
            canvas,
            context,
            on_pointer_down,
            on_pointer_enter,
            on_pointer_leave,
            on_keydown,
        })
    }

    pub fn render(&self) -> Result<(), JsValue> {
        let (vert_source, frag_source) = include_wgsl_to_glsl!("src/web/start_webgl.wgsl");

        let vert_shader = compile_shader(
            &self.context,
            WebGl2RenderingContext::VERTEX_SHADER,
            vert_source,
        )
        .unwrap();

        let frag_shader = compile_shader(
            &self.context,
            WebGl2RenderingContext::FRAGMENT_SHADER,
            frag_source,
        )
        .unwrap();

        let program = link_program(&self.context, &vert_shader, &frag_shader).unwrap();
        self.context.use_program(Some(&program));

        let geometry = test_geometry();

        let vertices = geometry
            .vertices
            .iter()
            .flat_map(|vertex| vertex.position)
            .collect::<Vec<f32>>();
        let indexes = geometry.indices.clone();

        let vao = self
            .context
            .create_vertex_array()
            .ok_or("Could not create vertex array object")
            .unwrap();
        self.context.bind_vertex_array(Some(&vao));

        let position_attribute_location = 0;
        {
            let buffer = self.context.create_buffer().unwrap();
            self.context
                .bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));

            // Note that `Float32Array::view` is somewhat dangerous (hence the
            // `unsafe`!). This is creating a raw view into our module's
            // `WebAssembly.Memory` buffer, but if we allocate more pages for ourself
            // (aka do a memory allocation in Rust) it'll cause the buffer to change,
            // causing the `Float32Array` to be invalid.
            //
            // As a result, after `Float32Array::view` we have to be very careful not to
            // do any memory allocations before it's dropped.
            unsafe {
                self.context.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    &js_sys::Float32Array::view(&vertices),
                    WebGl2RenderingContext::STATIC_DRAW,
                );
            }
        }

        self.context.vertex_attrib_pointer_with_i32(
            position_attribute_location as u32,
            2,
            WebGl2RenderingContext::FLOAT,
            false,
            0,
            0,
        );
        self.context
            .enable_vertex_attrib_array(position_attribute_location as u32);

        {
            let index_buffer = self
                .context
                .create_buffer()
                .ok_or("Failed to create buffer")?;
            self.context.bind_buffer(
                WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
                Some(&index_buffer),
            );
            unsafe {
                self.context.buffer_data_with_array_buffer_view(
                    WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
                    &js_sys::Uint16Array::view(&indexes),
                    WebGl2RenderingContext::STATIC_DRAW,
                );
            }
        }

        self.context.viewport(
            0,
            0,
            self.canvas.width() as i32,
            self.canvas.height() as i32,
        );

        self.context.clear_color(0.0, 0.0, 0.0, 1.0);
        self.context.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

        self.context.draw_elements_with_i32(
            WebGl2RenderingContext::TRIANGLES,
            indexes.len() as i32,
            WebGl2RenderingContext::UNSIGNED_SHORT,
            0,
        );

        Ok(())
    }

    pub fn resize(&self, width: u32, height: u32) {
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.render().unwrap();
    }

    pub fn canvas(&self) -> web_sys::HtmlCanvasElement {
        self.canvas.clone()
    }

    pub fn context(&self) -> WebGl2RenderingContext {
        self.context.clone()
    }

    pub fn on_pointer_down(&self, event: PointerEvent) {
        console::log_1(&format!("Pointer down at ({}, {})", event.x(), event.y()).into());
    }
}

pub fn compile_shader(
    context: &WebGl2RenderingContext,
    shader_type: u32,
    source: &str,
) -> Result<WebGlShader, String> {
    let shader = context
        .create_shader(shader_type)
        .ok_or_else(|| String::from("Unable to create shader object"))?;
    context.shader_source(&shader, source);
    context.compile_shader(&shader);

    if context
        .get_shader_parameter(&shader, WebGl2RenderingContext::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(context
            .get_shader_info_log(&shader)
            .unwrap_or_else(|| String::from("Unknown error creating shader")))
    }
}

pub fn link_program(
    context: &WebGl2RenderingContext,
    vert_shader: &WebGlShader,
    frag_shader: &WebGlShader,
) -> Result<WebGlProgram, String> {
    let program = context
        .create_program()
        .ok_or_else(|| String::from("Unable to create shader object"))?;

    context.attach_shader(&program, vert_shader);
    context.attach_shader(&program, frag_shader);
    context.link_program(&program);

    if context
        .get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(program)
    } else {
        Err(context
            .get_program_info_log(&program)
            .unwrap_or_else(|| String::from("Unknown error creating program object")))
    }
}

#[wasm_bindgen]
pub struct PointerEvent {
    x: f64,
    y: f64,
}

#[wasm_bindgen]
impl PointerEvent {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn x(&self) -> f64 {
        self.x
    }

    pub fn y(&self) -> f64 {
        self.y
    }

    pub fn set_x(&mut self, x: f64) {
        self.x = x;
    }

    pub fn set_y(&mut self, y: f64) {
        self.y = y;
    }
}
