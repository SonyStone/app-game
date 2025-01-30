use std::rc::Rc;

use super::start_webgl::create_program;

struct DrawShader {
    gl: Rc<web_sys::WebGl2RenderingContext>,
    program: web_sys::WebGlProgram,
}

impl DrawShader {
    pub fn new(gl: Rc<web_sys::WebGl2RenderingContext>) -> Self {
        let program = create_program(
            &gl,
            (
                include_str!("draw_shader.vert"),
                include_str!("draw_shader.frag"),
            ),
        )
        .unwrap();

        Self { program, gl }
    }

    pub fn use_program(&self) {
        self.gl.use_program(Some(&self.program));
    }

    pub fn clear_program(&self) {
        self.gl.use_program(None);
    }

    pub fn ortho(&self, ortho: Mat) {
        self.gl.uniformMatrix4fv(this.orthoLoc, false, ortho);
    }

    pub fn brush_size(&self, size: number) {
        self.gl.uniform1f(this.brushSizeLoc, size);
    }

    pub fn bound(&self, bound: Float32Array) {
        self.gl.uniform4fv(this.boundLoc, bound);
    }

    pub fn segment(&self, segment: Float32Array) {
        self.gl.uniform4fv(this.segmentLoc, segment);
    }
}
