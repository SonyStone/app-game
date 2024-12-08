mod static_variables;
pub use static_variables::*;

mod common_structs;
pub use common_structs::*;

use web_sys::{console, WebGl2RenderingContext, WebGlProgram};

/// Converts a single value to a byte slice.
pub fn value_as_u8_slice<T>(p: &T) -> &[u8] {
    unsafe { core::slice::from_raw_parts((p as *const T) as *const u8, core::mem::size_of_val(p)) }
}

/// Converts a slice of values to a byte slice.
pub fn slice_as_u8_slice<T>(vec: &[T]) -> &[u8] {
    unsafe { core::slice::from_raw_parts(vec.as_ptr() as *const u8, core::mem::size_of_val(vec)) }
}

pub fn create_shader_program(
    gl: &WebGl2RenderingContext,
    vs_glsl: &str,
    fs_glsl: &str,
) -> WebGlProgram {
    let (vertex_shader, fragment_shader) = (
        {
            let vertex_shader = gl
                .create_shader(WebGl2RenderingContext::VERTEX_SHADER)
                .unwrap();
            gl.shader_source(&vertex_shader, vs_glsl);
            gl.compile_shader(&vertex_shader);
            if !gl.get_shader_parameter(&vertex_shader, WebGl2RenderingContext::COMPILE_STATUS) {
                console::error_1(&gl.get_shader_info_log(&vertex_shader).unwrap().into());
            };
            vertex_shader
        },
        {
            let fragment_shader = gl
                .create_shader(WebGl2RenderingContext::FRAGMENT_SHADER)
                .unwrap();
            gl.shader_source(&fragment_shader, fs_glsl);
            gl.compile_shader(&fragment_shader);
            if !gl.get_shader_parameter(&fragment_shader, WebGl2RenderingContext::COMPILE_STATUS) {
                console::error_1(&gl.get_shader_info_log(&fragment_shader).unwrap().into());
            };
            fragment_shader
        },
    );

    let prg = {
        let prg = gl.create_program().unwrap();
        gl.attach_shader(&prg, &vertex_shader);
        gl.attach_shader(&prg, &fragment_shader);
        gl.link_program(&prg);
        if !gl.get_program_parameter(&prg, WebGl2RenderingContext::LINK_STATUS) {
            console::error_1(&gl.get_program_info_log(&prg).unwrap().into());
        };
        prg
    };

    {
        // NOTE! These are only here to unclutter the diagram.
        // It is safe to detach and delete shaders once
        // a program is linked though it is arguably not common.
        // and I usually don't do it.
        gl.detach_shader(&prg, &vertex_shader);
        gl.delete_shader(Some(&vertex_shader));
        gl.detach_shader(&prg, &fragment_shader);
        gl.delete_shader(Some(&fragment_shader));
    };

    prg
}
