use wasm_bindgen::JsValue;
use web_sys::{WebGl2RenderingContext, WebGlFramebuffer};
use webgl_common::FramebufferTarget;

#[derive(Debug, Clone)]
pub struct Framebuffer {
    framebuffer: WebGlFramebuffer,
}

impl Framebuffer {
    pub fn new(gl: &WebGl2RenderingContext) -> Result<Self, JsValue> {
        let framebuffer = gl
            .create_framebuffer()
            .ok_or("Failed to create framebuffer")?;
        Ok(Self { framebuffer })
    }

    pub fn unbind(gl: &WebGl2RenderingContext, target: FramebufferTarget) {
        gl.bind_framebuffer(target.into(), None);
    }

    pub fn bind(&self, gl: &WebGl2RenderingContext) {
        gl.bind_framebuffer(
            FramebufferTarget::Framebuffer.into(),
            Some(&self.framebuffer),
        );
    }
}
