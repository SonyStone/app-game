use core::str;
use std::{f32::consts::PI, rc::Rc};

use fundamentals_common::{
    create_checker_texture, create_decal_texture,
    cube_data::get_vertex_data,
    set_element_array_buffer,
    uniform::{SetUniform, Uniform},
};
use nalgebra::{Matrix4, Perspective3, Vector3};
use wasm_bindgen::prelude::*;
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext, WebGlProgram, WebGlTexture, WebGlVertexArrayObject,
};
use webgl_common::{create_shader_program, slice_as_u8_slice};

#[wasm_bindgen]
pub struct App {
    canvas: HtmlCanvasElement,
    gl: Rc<WebGl2RenderingContext>,
    vao: WebGlVertexArrayObject,
    uniforms: Uniforms,
    program: WebGlProgram,
    checker_texture: WebGlTexture,
    decal_texture: WebGlTexture,
}

struct Uniforms {
    projection: Uniform<Matrix4<f32>>,
    model_view: Uniform<Matrix4<f32>>,
    diffuse: Uniform<u32>,
    decal: Uniform<u32>,
    diffuse_mult: Uniform<[f32; 4]>,
    light_dir: Uniform<Vector3<f32>>,
}

#[wasm_bindgen]
impl App {
    /// is initialization code
    pub fn new(canvas: web_sys::HtmlCanvasElement) -> Self {
        let gl = canvas
            .get_context("webgl2")
            .unwrap()
            .unwrap()
            .dyn_into::<WebGl2RenderingContext>()
            .unwrap();

        let gl = Rc::new(gl);

        let prg = create_shader_program(
            &gl,
            include_str!("shader.vert"),
            include_str!("shader.frag"),
        );

        let cube_vertex_array = {
            let cube_vertex_array = gl.create_vertex_array().unwrap();
            gl.bind_vertex_array(Some(&cube_vertex_array));

            let (cube_vectex, cube_vertex_indices, cube_attributes) = get_vertex_data();

            {
                let buffer = gl.create_buffer().unwrap();
                gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));
                gl.buffer_data_with_u8_array(
                    WebGl2RenderingContext::ARRAY_BUFFER,
                    slice_as_u8_slice(&cube_vectex),
                    WebGl2RenderingContext::STATIC_DRAW,
                );
                cube_attributes.iter().for_each(|attr| {
                    let i = match attr.location {
                        Some(i) => i,
                        None => gl.get_attrib_location(&prg, attr.name) as u32,
                    };
                    gl.enable_vertex_attrib_array(i);
                    gl.vertex_attrib_pointer_with_i32(
                        i,
                        attr.size,
                        attr.data_type.into(),
                        attr.normalized,
                        attr.stride,
                        attr.offset,
                    );
                });
            }

            set_element_array_buffer(
                &gl,
                &cube_vertex_indices,
                WebGl2RenderingContext::STATIC_DRAW,
            );

            // This is not really needed but if we end up binding anything
            // to ELEMENT_ARRAY_BUFFER, say we are generating indexed geometry
            // we'll change cubeVertexArray's ELEMENT_ARRAY_BUFFER. By binding
            // null here that won't happen.
            gl.bind_vertex_array(None);

            cube_vertex_array
        };

        Self {
            uniforms: Uniforms {
                projection: Uniform::new(
                    Rc::clone(&gl),
                    gl.get_uniform_location(&prg, "projection").unwrap(),
                ),
                model_view: Uniform::new(
                    Rc::clone(&gl),
                    gl.get_uniform_location(&prg, "modelView").unwrap(),
                ),
                diffuse: Uniform::new(
                    Rc::clone(&gl),
                    gl.get_uniform_location(&prg, "diffuse").unwrap(),
                ),
                decal: Uniform::new(
                    Rc::clone(&gl),
                    gl.get_uniform_location(&prg, "decal").unwrap(),
                ),
                diffuse_mult: Uniform::new(
                    Rc::clone(&gl),
                    gl.get_uniform_location(&prg, "diffuseMult").unwrap(),
                ),
                light_dir: Uniform::new(
                    Rc::clone(&gl),
                    gl.get_uniform_location(&prg, "lightDir").unwrap(),
                ),
            },
            checker_texture: create_checker_texture(&gl),
            decal_texture: create_decal_texture(&gl),
            canvas,
            vao: cube_vertex_array,
            program: prg,
            gl,
        }
    }

    /// is rendering code.
    pub fn render(&self) {
        {
            // Set up WebGL state before rendering
            // and cleanup the canvas
            self.gl.viewport(
                0,
                0,
                self.canvas.width() as i32,
                self.canvas.height() as i32,
            );

            self.gl.clear_color(0.5, 0.7, 1.0, 1.0);
            self.gl.clear(
                WebGl2RenderingContext::COLOR_BUFFER_BIT | WebGl2RenderingContext::DEPTH_BUFFER_BIT,
            );

            self.gl.enable(WebGl2RenderingContext::DEPTH_TEST);
            self.gl.enable(WebGl2RenderingContext::CULL_FACE);
        }

        {
            self.gl.use_program(Some(&self.program));
            self.gl.bind_vertex_array(Some(&self.vao));
            {
                // Picking unit 6 just to be different. The default of 0
                // would render but would show less state changing.
                let tex_unit = 6;
                self.gl
                    .active_texture(WebGl2RenderingContext::TEXTURE0 + tex_unit);
                self.gl.bind_texture(
                    WebGl2RenderingContext::TEXTURE_2D,
                    Some(&self.checker_texture),
                );
                self.uniforms.diffuse.set(&tex_unit);
            }
            {
                let tex_unit = 3;
                self.gl
                    .active_texture(WebGl2RenderingContext::TEXTURE0 + tex_unit);
                self.gl.bind_texture(
                    WebGl2RenderingContext::TEXTURE_2D,
                    Some(&self.decal_texture),
                );
                self.uniforms.decal.set(&tex_unit);
            }

            {
                // set up light direction
                let light_dir: Vector3<f32> = Vector3::new(1.0, 5.0, 8.0).normalize();
                self.uniforms.light_dir.set(&light_dir);
            }

            {
                // set up projection matrix
                let projection = Perspective3::new(
                    self.canvas.client_width() as f32 / self.canvas.client_height() as f32,
                    PI / 4.0,
                    0.1,
                    10.0,
                );

                self.uniforms.projection.set(projection.as_matrix());
            }

            {
                // draw center cube
                let model_view = Matrix4::new_translation(&Vector3::new(0.0, 0.0, -5.0))
                    * Matrix4::from_euler_angles(0.5, 0.0, 0.0)
                    * Matrix4::from_euler_angles(0.0, 0.5, 0.0);

                self.uniforms.model_view.set(&model_view);
                self.uniforms.diffuse_mult.set(&[0.7, 1.0, 0.7, 1.0]);

                self.gl.draw_elements_with_i32(
                    WebGl2RenderingContext::TRIANGLES,
                    36,                                     // num vertices to process
                    WebGl2RenderingContext::UNSIGNED_SHORT, // type of indices
                    0,                                      // offset on bytes to indices
                );
            }

            {
                // draw left cube

                let model_view = Matrix4::new_translation(&Vector3::new(-3.0, 0.0, -4.0))
                    * Matrix4::from_euler_angles(0.5, 0.0, 0.0)
                    * Matrix4::from_euler_angles(0.0, 0.8, 0.0);

                self.uniforms.model_view.set(&model_view);
                self.uniforms.diffuse_mult.set(&[1.0, 0.7, 0.7, 1.0]);

                self.gl.draw_elements_with_i32(
                    WebGl2RenderingContext::TRIANGLES,
                    36,                                     // num vertices to process
                    WebGl2RenderingContext::UNSIGNED_SHORT, // type of indices
                    0,                                      // offset on bytes to indices
                );
            }

            {
                // draw right cube

                let model_view = Matrix4::new_translation(&Vector3::new(3.0, 0.0, -4.0))
                    * Matrix4::from_euler_angles(0.5, 0.0, 0.0)
                    * Matrix4::from_euler_angles(0.0, -0.6, 0.0);

                self.uniforms.model_view.set(&model_view);
                self.uniforms.diffuse_mult.set(&[0.7, 0.7, 1.0, 1.0]);

                self.gl.draw_elements_with_i32(
                    WebGl2RenderingContext::TRIANGLES,
                    36,                                     // num vertices to process
                    WebGl2RenderingContext::UNSIGNED_SHORT, // type of indices
                    0,                                      // offset on bytes to indices
                );
            }
        }
    }
}
