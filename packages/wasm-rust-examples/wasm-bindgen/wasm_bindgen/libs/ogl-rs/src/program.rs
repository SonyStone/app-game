use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use web_sys::{WebGl2RenderingContext, WebGlProgram, WebGlUniformLocation};
use webgl_common::static_variables::{CullFaceMode, DepthFunction, FrontFaceDirection};

use crate::{BlendEquationState, BlendFuncState};

static mut ID: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UniformInfo {
    pub uniform_name: String,
    pub name_components: Vec<String>,
    pub is_struct: bool,
    pub is_struct_array: bool,
    pub struct_index: usize,
    pub struct_property: String,
}

pub struct Program<'a> {
    gl: &'a WebGl2RenderingContext,
    uniforms: HashMap<String, JsValue>,
    id: u32,

    /// this 7 variables are the state of the program
    pub cull_face: Option<CullFaceMode>,
    pub depth_test: bool,
    pub blend_func: Option<BlendFuncState>,
    pub front_face: FrontFaceDirection,
    pub depth_write: bool,
    pub depth_func: DepthFunction,
    pub blend_equation: Option<BlendEquationState>,

    transparent: bool,

    pub program: WebGlProgram,
    uniform_locations: HashMap<UniformInfo, WebGlUniformLocation>,
    attribute_locations: HashMap<String, i32>,
    attribute_order: String,
}

impl<'a> Program<'a> {
    pub fn new(
        gl: &'a WebGl2RenderingContext,
        vertex: &String,
        fragment: &String,
    ) -> Result<Self, JsValue> {
        let uniforms = HashMap::new();
        let transparent = false;
        let cull_face = Some(CullFaceMode::Back);
        let front_face = FrontFaceDirection::Ccw;

        let depth_test = true;
        let stencil_test = false;
        let depth_write = true;
        let depth_func = DepthFunction::Less;

        if gl.canvas().is_none() {
            return Err(JsValue::from_str(
                "gl not passed as first argument to Program",
            ));
        }

        let id = unsafe {
            let current_id = ID;
            ID += 1;
            current_id
        };

        if vertex.is_empty() {
            web_sys::console::warn_1(&JsValue::from_str("vertex shader not supplied"));
        }
        if fragment.is_empty() {
            web_sys::console::warn_1(&JsValue::from_str("fragment shader not supplied"));
        }

        // Compile vertex shader and log errors
        let vertex_shader = {
            let vertex_shader = gl
                .create_shader(WebGl2RenderingContext::VERTEX_SHADER)
                .unwrap();
            gl.shader_source(&vertex_shader, vertex);
            gl.compile_shader(&vertex_shader);
            if let Some(log) = gl.get_shader_info_log(&vertex_shader) {
                if !log.is_empty() {
                    return Err(JsValue::from_str(&format!(
                        "{}\nVertex Shader\n{}",
                        log,
                        add_line_numbers(vertex)
                    )));
                }
            }
            vertex_shader
        };

        // Compile fragment shader and log errors
        let fragment_shader = {
            let fragment_shader = gl
                .create_shader(WebGl2RenderingContext::FRAGMENT_SHADER)
                .unwrap();
            gl.shader_source(&fragment_shader, fragment);
            gl.compile_shader(&fragment_shader);
            if let Some(log) = gl.get_shader_info_log(&fragment_shader) {
                if !log.is_empty() {
                    return Err(JsValue::from_str(&format!(
                        "{}\nFragment Shader\n{}",
                        log,
                        add_line_numbers(fragment)
                    )));
                }
            }
            fragment_shader
        };

        // Compile program and log errors
        let program = {
            let program = gl.create_program().unwrap();
            gl.attach_shader(&program, &vertex_shader);
            gl.attach_shader(&program, &fragment_shader);
            gl.link_program(&program);
            if !gl
                .get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS)
                .as_bool()
                .unwrap_or(false)
            {
                return Err(JsValue::from_str(
                    &gl.get_program_info_log(&program).unwrap_or_default(),
                ));
            }
            program
        };

        // Remove shader once linked
        {
            gl.delete_shader(Some(&vertex_shader));
            gl.delete_shader(Some(&fragment_shader));
        }

        // Get active uniform locations
        let uniform_locations = {
            let mut uniform_locations = HashMap::new();
            let num_uniforms = gl
                .get_program_parameter(&program, WebGl2RenderingContext::ACTIVE_UNIFORMS)
                .as_f64()
                .unwrap() as u32;
            for u_index in 0..num_uniforms {
                let uniform = gl.get_active_uniform(&program, u_index).unwrap();
                let location = gl.get_uniform_location(&program, &uniform.name()).unwrap();
                let uniform_info = UniformInfo {
                    uniform_name: uniform.name(),
                    name_components: uniform.name().split('.').map(String::from).collect(),
                    is_struct: false,
                    is_struct_array: false,
                    struct_index: 0,
                    struct_property: String::new(),
                };
                uniform_locations.insert(uniform_info, location);
            }
            uniform_locations
        };

        // Get active attribute locations
        let (attribute_locations, attribute_order) = {
            let mut attribute_locations = HashMap::new();
            let mut locations = Vec::new();
            let num_attribs = gl
                .get_program_parameter(&program, WebGl2RenderingContext::ACTIVE_ATTRIBUTES)
                .as_f64()
                .unwrap() as u32;
            for a_index in 0..num_attribs {
                let attribute = gl.get_active_attrib(&program, a_index).unwrap();
                let location = gl.get_attrib_location(&program, &attribute.name());
                if location == -1 {
                    continue;
                }
                locations.push(attribute.name());
                attribute_locations.insert(attribute.name(), location);
            }
            let attribute_order = locations.join("");
            (attribute_locations, attribute_order)
        };

        Ok(Self {
            gl,
            uniforms,
            id,
            transparent,
            cull_face,
            front_face,
            depth_test,
            depth_write,
            depth_func,
            blend_func: None,
            blend_equation: None,
            program,
            uniform_locations,
            attribute_locations,
            attribute_order,
        })
    }

    // pub fn set_transparent(&mut self, transparent: bool) {
    //     self.transparent = transparent;

    //     if self.transparent && self.blend_func.is_none() {
    //         if self.gl.renderer.premultiplied_alpha.unwrap_or(false)
    //         {
    //             self.set_blend_func(BlendFuncState {
    //                 src: BlendFunc::One,
    //                 dst: BlendFunc::OneMinusSrcAlpha,
    //                 src_alpha: None,
    //                 dst_alpha: None,
    //             });
    //         } else {
    //             self.set_blend_func(BlendFuncState {
    //                 src: BlendFunc::SrcAlpha,
    //                 dst: BlendFunc::OneMinusSrcAlpha,
    //                 src_alpha: None,
    //                 dst_alpha: None,
    //             });
    //         }
    //     } else if !self.transparent {
    //         self.blend_func = None;
    //     }
    // }

    pub fn set_blend_func(&mut self, blend_func: BlendFuncState) {
        self.blend_func = Some(blend_func);
        if blend_func.src as u32 != 0 {
            self.transparent = true;
        }
    }

    pub fn set_blend_equation(&mut self, blend_equation: BlendEquationState) {
        self.blend_equation = Some(blend_equation);
    }

    pub fn remove(&self) {
        self.gl.delete_program(Some(&self.program));
    }
}

impl Drop for Program<'_> {
    fn drop(&mut self) {
        self.remove();
    }
}

fn set_uniform(
    gl: &WebGl2RenderingContext,
    type_: u32,
    location: &WebGlUniformLocation,
    value: impl Into<JsValue>,
) {
    match type_ {
        WebGl2RenderingContext::FLOAT => {
            if let Some(value) = value.into().as_f64() {
                gl.uniform1f(Some(location), value as f32);
            }
        }
        WebGl2RenderingContext::FLOAT_VEC2 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform2fv_with_f32_array(Some(location), &[values as f32]);
            }
        }
        WebGl2RenderingContext::FLOAT_VEC3 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform3fv_with_f32_array(Some(location), &[values as f32]);
            }
        }
        WebGl2RenderingContext::FLOAT_VEC4 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform4fv_with_f32_array(Some(location), &[values as f32]);
            }
        }
        WebGl2RenderingContext::INT => {
            if let Some(value) = value.into().as_f64() {
                gl.uniform1i(Some(location), value as i32);
            }
        }
        WebGl2RenderingContext::INT_VEC2 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform2iv_with_i32_array(Some(location), &[values as i32]);
            }
        }
        WebGl2RenderingContext::INT_VEC3 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform3iv_with_i32_array(Some(location), &[values as i32]);
            }
        }
        WebGl2RenderingContext::INT_VEC4 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform4iv_with_i32_array(Some(location), &[values as i32]);
            }
        }
        WebGl2RenderingContext::BOOL => {
            if let Some(value) = value.into().as_f64() {
                gl.uniform1i(Some(location), value as i32);
            }
        }
        WebGl2RenderingContext::BOOL_VEC2 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform2iv_with_i32_array(Some(location), &[values as i32]);
            }
        }
        WebGl2RenderingContext::BOOL_VEC3 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform3iv_with_i32_array(Some(location), &[values as i32]);
            }
        }
        WebGl2RenderingContext::BOOL_VEC4 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform4iv_with_i32_array(Some(location), &[values as i32]);
            }
        }
        WebGl2RenderingContext::FLOAT_MAT2 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform_matrix2fv_with_f32_array(Some(location), false, &[values as f32]);
            }
        }
        WebGl2RenderingContext::FLOAT_MAT3 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform_matrix3fv_with_f32_array(Some(location), false, &[values as f32]);
            }
        }
        WebGl2RenderingContext::FLOAT_MAT4 => {
            if let Some(values) = value.into().as_f64() {
                gl.uniform_matrix4fv_with_f32_array(Some(location), false, &[values as f32]);
            }
        }
        _ => {}
    }
}

fn add_line_numbers(string: &str) -> String {
    string
        .lines()
        .enumerate()
        .map(|(i, line)| format!("{}: {}", i + 1, line))
        .collect::<Vec<_>>()
        .join("\n")
}

fn warn(message: &str) {
    web_sys::console::warn_1(&JsValue::from_str(message));
}
