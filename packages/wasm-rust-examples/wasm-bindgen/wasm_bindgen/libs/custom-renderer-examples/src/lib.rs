use custom_renderer::{
    buffer::Buffer, renderer::Renderer, renderer_state::RendererState,
    shader_program::ShaderProgram, vertex_array_object::VertexArrayObject, BufferTarget,
    BufferUsage, Color, DataType, DrawMode, Mask, Viewport,
};
use wasm_bindgen::prelude::*;
use web_sys::{console, WebGl2RenderingContext};

#[wasm_bindgen]
pub struct App {
    canvas: web_sys::HtmlCanvasElement,
    renderer: Renderer,
}

#[wasm_bindgen]
impl App {
    pub fn new(canvas: web_sys::HtmlCanvasElement) -> Self {
        let gl = canvas
            .get_context("webgl2")
            .unwrap()
            .unwrap()
            .dyn_into::<WebGl2RenderingContext>()
            .unwrap();

        let mut renderer = Renderer::new(gl);

        let renderer_state = RendererState {
            program: Some(
                ShaderProgram::new(
                    &renderer.gl,
                    include_str!("shader.vert"),
                    include_str!("shader.frag"),
                )
                .unwrap(),
            ),
            array_buffer: Some(Buffer::new(&renderer.gl)),
            vertex_array_object: Some(VertexArrayObject::new(&renderer.gl)),
            clear_color: Color::new(0.0, 0.1, 0.1, 1.0),
            ..RendererState::default()
        };

        renderer.set_state(renderer_state);

        let position_attribute_location = 1;

        let data: Vec<f32> = vec![0.0, 0.0, 0.0, 0.5, 0.7, 0.0];
        renderer.buffer_data(BufferTarget::ArrayBuffer, &data, BufferUsage::StaticDraw);

        renderer.enable_vertex_attrib_array(position_attribute_location);

        renderer.vertex_attrib_pointer(
            position_attribute_location,
            2,
            DataType::Float,
            false,
            0,
            0,
        );

        renderer.viewport(&renderer.state.viewport);
        renderer.clear_color(&renderer.state.clear_color);
        renderer.clear(Mask::ColorBufferBit);
        renderer.draw_arrays(DrawMode::Triangles, 0, 3);

        console::log_1(&format!("renderer_state {:#?}", renderer).into());

        Self { canvas, renderer }
    }
}
