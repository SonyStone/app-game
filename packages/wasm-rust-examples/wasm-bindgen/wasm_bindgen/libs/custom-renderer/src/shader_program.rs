use crate::bindable::Bindable;
use web_sys::{WebGl2RenderingContext, WebGlProgram, WebGlShader};
use webgl_common::ShaderType;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShaderProgram {
    pub program: WebGlProgram,
}

impl ShaderProgram {
    pub fn new(
        gl: &WebGl2RenderingContext,
        vert_src: &str,
        frag_src: &str,
    ) -> Result<Self, String> {
        let vert_shader = compile_shader(gl, ShaderType::VertexShader, vert_src)?;
        let frag_shader = compile_shader(gl, ShaderType::FragmentShader, frag_src)?;
        let program = link_program(gl, &vert_shader, &frag_shader)?;
        Ok(ShaderProgram { program })
    }
}

impl Bindable for ShaderProgram {
    fn bind(&self, gl: &WebGl2RenderingContext) {
        gl.use_program(Some(&self.program));
    }
}

fn compile_shader(
    gl: &WebGl2RenderingContext,
    shader_type: ShaderType,
    source: &str,
) -> Result<WebGlShader, String> {
    let shader = gl
        .create_shader(shader_type.into())
        .ok_or("Unable to create shader object")?;
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
            .unwrap_or("Unknown error creating shader".into()))
    }
}

fn link_program(
    gl: &WebGl2RenderingContext,
    vert_shader: &WebGlShader,
    frag_shader: &WebGlShader,
) -> Result<WebGlProgram, String> {
    let program = gl
        .create_program()
        .ok_or("Unable to create shader object")?;
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
            .unwrap_or("Unknown error creating program object".into()))
    }
}
