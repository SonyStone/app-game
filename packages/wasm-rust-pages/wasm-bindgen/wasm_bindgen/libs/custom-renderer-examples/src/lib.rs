use custom_renderer::{
    buffer::Buffer,
    renderer::Renderer,
    shader_program::ShaderProgram,
    vertex_array_object::{AttributeOptions, VertexArrayObject},
    BufferTarget, BufferUsage, Color, DataType, DrawMode, Mask, Viewport,
};
use wasm_bindgen::prelude::*;
use web_sys::{console, WebGl2RenderingContext};

#[wasm_bindgen]
pub struct App {
    canvas: web_sys::HtmlCanvasElement,
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

        // let renderer_state = RendererState {
        //     program: Some(
        //         ShaderProgram::new(
        //             &renderer.gl,
        //             include_str!("shader.vert"),
        //             include_str!("shader.frag"),
        //         )
        //         .unwrap(),
        //     ),
        //     array_buffer: Some(Buffer::new(&renderer.gl)),
        //     vertex_array_object: Some(VertexArrayObject::new(&renderer.gl)),
        //     clear_color: Color::new(0.0, 0.1, 0.1, 1.0),
        //     ..RendererState::default()
        // };

        let program = renderer
            .create_shader_program(include_str!("shader.vert"), include_str!("shader.frag"))
            .unwrap();

        renderer.use_program(&program);

        let mut array_buffer = Buffer::new(&renderer.gl);
        let data: Vec<f32> = vec![0.0, 0.0, 0.0, 0.5, 0.7, 0.0];
        // renderer.state.array_buffer = Some(&array_buffer);
        array_buffer.set_data(BufferTarget::ArrayBuffer, &data, BufferUsage::StaticDraw);

        let mut vertex_array_object = VertexArrayObject::new(&renderer.gl);
        vertex_array_object.bind();
        vertex_array_object.add_buffer(
            &array_buffer,
            1,
            AttributeOptions {
                size: 2,
                data_type: DataType::Float,
                normalized: false,
                stride: 0,
                offset: 0,
            },
        );
        vertex_array_object.unbind();

        renderer.viewport(&Viewport::default());
        renderer.clear_color(&Color::new(0.0, 0.1, 0.1, 1.0));
        renderer.clear(Mask::ColorBufferBit);
        vertex_array_object.bind();
        renderer.draw_arrays(DrawMode::Triangles, 0, 3);

        console::log_1(&format!("renderer_state {:#?}", renderer).into());

        Self { canvas }
    }
}
