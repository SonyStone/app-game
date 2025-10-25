use nalgebra::{Matrix4, Vector3};
use std::{marker::PhantomData, rc::Rc};
use web_sys::{WebGl2RenderingContext, WebGlUniformLocation};

pub struct Uniform<T> {
    gl: Rc<WebGl2RenderingContext>,
    location: WebGlUniformLocation,
    value: PhantomData<T>,
}

impl<T> Uniform<T> {
    pub fn new(gl: Rc<WebGl2RenderingContext>, location: WebGlUniformLocation) -> Self {
        Self {
            gl,
            location,
            value: PhantomData,
        }
    }
}

pub trait SetUniform<T> {
    fn set(&self, data: &T);
}

impl SetUniform<Matrix4<f32>> for Uniform<Matrix4<f32>> {
    fn set(&self, data: &Matrix4<f32>) {
        self.gl
            .uniform_matrix4fv_with_f32_array(Some(&self.location), false, data.as_slice());
    }
}

impl SetUniform<u32> for Uniform<u32> {
    fn set(&self, data: &u32) {
        self.gl.uniform1i(Some(&self.location), *data as i32);
    }
}

impl SetUniform<[f32; 4]> for Uniform<[f32; 4]> {
    fn set(&self, data: &[f32; 4]) {
        self.gl
            .uniform4fv_with_f32_array(Some(&self.location), data);
    }
}

impl SetUniform<Vector3<f32>> for Uniform<Vector3<f32>> {
    fn set(&self, data: &Vector3<f32>) {
        self.gl
            .uniform3fv_with_f32_array(Some(&self.location), data.as_slice());
    }
}
