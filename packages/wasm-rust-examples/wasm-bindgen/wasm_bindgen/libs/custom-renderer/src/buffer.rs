use web_sys::{WebGl2RenderingContext, WebGlBuffer};
use webgl_common::{slice_as_u8_slice, BufferTarget, BufferUsage};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Buffer<'a> {
    gl: &'a WebGl2RenderingContext,
    pub buffer: WebGlBuffer,
    is_binded: bool,
    // target: Option<BufferTarget>, // ? not sure if this is needed
    size: Option<usize>,
}

impl<'a> Buffer<'a> {
    pub fn new(gl: &'a WebGl2RenderingContext) -> Self {
        let buffer = gl.create_buffer().expect("Failed to create buffer");
        Buffer {
            gl,
            buffer,
            is_binded: false,
            size: None,
            // target: None,
        }
    }

    pub fn bind(&self, target: BufferTarget) {
        self.gl.bind_buffer(target.into(), Some(&self.buffer));
    }

    pub fn unbind(&mut self, target: BufferTarget) {
        if self.is_binded {
            self.gl.bind_buffer(target.into(), None);
            self.is_binded = false;
        };
    }

    pub fn bind_base(&mut self, target: BufferTarget, index: u32) {
        self.gl
            .bind_buffer_base(target.into(), index, Some(&self.buffer));
        self.is_binded = true;
    }

    pub fn set_data<T>(&mut self, target: BufferTarget, data: &[T], usage: BufferUsage) {
        self.bind(target);

        let data = slice_as_u8_slice(data);
        let target = target.into();

        match self.size {
            Some(buffer_size) if data.len() < buffer_size => {
                self.gl
                    .buffer_sub_data_with_i32_and_u8_array(target, 0, data);
            }
            _ => {
                let usage = usage.into();
                self.size = Some(data.len());
                self.gl.buffer_data_with_u8_array(target, data, usage);
            }
        };
    }
}

impl<'a> Drop for Buffer<'a> {
    fn drop(&mut self) {
        self.gl.delete_buffer(Some(&self.buffer));
    }
}
