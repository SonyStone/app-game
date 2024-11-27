use web_sys::WebGl2RenderingContext;

///
/// A trait for objects that can be bound to a WebGL context.
///
pub trait Bindable {
    fn bind(&self, gl: &WebGl2RenderingContext);
}
