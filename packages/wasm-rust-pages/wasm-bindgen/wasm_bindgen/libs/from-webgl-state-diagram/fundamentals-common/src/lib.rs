use wasm_bindgen::JsCast;
use web_sys::{
    CanvasRenderingContext2d, HtmlCanvasElement, WebGl2RenderingContext, WebGlBuffer, WebGlTexture,
};
use webgl_common::slice_as_u8_slice;

pub mod cube_data;
pub mod cube_data_old;
pub mod uniform;

pub fn set_array_buffer<T>(
    gl: &WebGl2RenderingContext,
    data: &[T],
    location: u32,
    usage: u32,
    size: i32,
    type_: u32,
    normalized: bool,
    stride: i32,
    offset: i32,
) -> WebGlBuffer {
    let buffer = gl.create_buffer().unwrap();
    gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));
    gl.buffer_data_with_u8_array(
        WebGl2RenderingContext::ARRAY_BUFFER,
        slice_as_u8_slice(data),
        usage,
    );
    gl.enable_vertex_attrib_array(location);
    gl.vertex_attrib_pointer_with_i32(
        location,   // location
        size,       // size (components per iteration)
        type_,      // type of to get from buffer
        normalized, // normalize
        stride,     // stride (bytes to advance each iteration)
        offset,     // offset (bytes from start of buffer)
    );
    buffer
}

pub fn set_element_array_buffer<T>(
    gl: &WebGl2RenderingContext,
    data: &[T],
    usage: u32,
) -> WebGlBuffer {
    let index_buffer = gl.create_buffer().unwrap();
    gl.bind_buffer(
        WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
        Some(&index_buffer),
    );
    gl.buffer_data_with_u8_array(
        WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
        slice_as_u8_slice(data),
        usage,
    );
    index_buffer
}

pub fn create_checker_texture(gl: &WebGl2RenderingContext) -> WebGlTexture {
    let checker_texture = gl.create_texture().unwrap();
    gl.bind_texture(WebGl2RenderingContext::TEXTURE_2D, Some(&checker_texture));
    let data: Vec<u8> = vec![
        192, 128, 192, 128, //
        128, 192, 128, 192, //
        192, 128, 192, 128, //
        128, 192, 128, 192,
    ];
    gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
        WebGl2RenderingContext::TEXTURE_2D,
        0,                                        // mip level
        WebGl2RenderingContext::LUMINANCE as i32, // internal format
        4,                                        // width
        4,                                        // height
        0,                                        // border
        WebGl2RenderingContext::LUMINANCE,        // format
        WebGl2RenderingContext::UNSIGNED_BYTE,    // type
        Some(slice_as_u8_slice(&data)),           // data
    )
    .unwrap();
    gl.tex_parameteri(
        WebGl2RenderingContext::TEXTURE_2D,
        WebGl2RenderingContext::TEXTURE_MIN_FILTER,
        WebGl2RenderingContext::NEAREST as i32,
    );
    gl.tex_parameteri(
        WebGl2RenderingContext::TEXTURE_2D,
        WebGl2RenderingContext::TEXTURE_MAG_FILTER,
        WebGl2RenderingContext::NEAREST as i32,
    );
    gl.tex_parameteri(
        WebGl2RenderingContext::TEXTURE_2D,
        WebGl2RenderingContext::TEXTURE_WRAP_S,
        WebGl2RenderingContext::CLAMP_TO_EDGE as i32,
    );
    gl.tex_parameteri(
        WebGl2RenderingContext::TEXTURE_2D,
        WebGl2RenderingContext::TEXTURE_WRAP_T,
        WebGl2RenderingContext::CLAMP_TO_EDGE as i32,
    );
    checker_texture
}

pub fn create_decal_texture(gl: &WebGl2RenderingContext) -> WebGlTexture {
    let decal_texture = gl.create_texture().unwrap();
    gl.bind_texture(WebGl2RenderingContext::TEXTURE_2D, Some(&decal_texture));
    gl.tex_image_2d_with_u32_and_u32_and_html_canvas_element(
        WebGl2RenderingContext::TEXTURE_2D,
        0,                                     // mip level
        WebGl2RenderingContext::RGBA as i32,   // internal format
        WebGl2RenderingContext::RGBA,          // format
        WebGl2RenderingContext::UNSIGNED_BYTE, // type
        &make_text_canvas("F", 32, 32, "red"),
    )
    .unwrap();
    gl.generate_mipmap(WebGl2RenderingContext::TEXTURE_2D);
    decal_texture
}

pub fn make_text_canvas(text: &str, width: u32, height: u32, color: &str) -> HtmlCanvasElement {
    let window = web_sys::window().expect("no global `window` exists");
    let document = window.document().expect("should have a document on window");

    let canvas = document
        .create_element("canvas")
        .unwrap()
        .dyn_into::<HtmlCanvasElement>()
        .unwrap();
    let ctx = canvas
        .get_context("2d")
        .unwrap()
        .unwrap()
        .dyn_into::<CanvasRenderingContext2d>()
        .unwrap();

    canvas.set_width(width);
    canvas.set_height(height);
    ctx.set_font(format!("bold {}px sans-serif", height * 5 / 6).as_str());
    ctx.set_text_align("center");
    ctx.set_text_baseline("middle");
    ctx.set_fill_style_str(color);
    ctx.fill_text(text, width as f64 / 2.0, height as f64 / 2.0)
        .unwrap();
    canvas
}
