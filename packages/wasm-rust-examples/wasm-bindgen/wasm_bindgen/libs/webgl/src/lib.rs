use std::default;

use wasm_bindgen::{JsCast, JsValue};
use web_sys::{
    console, HtmlCanvasElement, WebGl2RenderingContext, WebGlProgram, WebGlShader,
    WebglDebugRendererInfo,
};

pub struct WebGlRenderBackend {
    gl: WebGl2RenderingContext,
}

impl WebGlRenderBackend {
    pub fn new(
        canvas: &HtmlCanvasElement,
        is_transparent: bool,
    ) -> Result<WebGlRenderBackend, JsValue> {
        let context_options = {
            let options = [
                ("stencil", JsValue::TRUE),
                ("alpha", JsValue::from_bool(is_transparent)),
                ("antialias", JsValue::FALSE),
                ("depth", JsValue::FALSE),
                ("failIfMajorPerformanceCaveat", JsValue::TRUE), // fail if no GPU available
                ("premultipliedAlpha", JsValue::TRUE),
            ];
            let context_options = js_sys::Object::new();
            for (name, value) in options.into_iter() {
                js_sys::Reflect::set(&context_options, &JsValue::from(name), &value).unwrap();
            }
            context_options
        };

        let gl = canvas
            .get_context_with_context_options("webgl2", &context_options)?
            .unwrap()
            .dyn_into::<WebGl2RenderingContext>()?;

        let msaa_sample_count = {
            let mut msaa_sample_count = 4;
            if let Ok(max_samples) = gl.get_parameter(WebGl2RenderingContext::MAX_SAMPLES) {
                msaa_sample_count = std::cmp::min(
                    msaa_sample_count,
                    max_samples.as_f64().unwrap_or(0.0) as u32,
                );
            }
            msaa_sample_count
        };

        {
            // Get WebGL driver info.
            if log::log_enabled!(log::Level::Info) {
                let driver_info = gl
                    .get_extension("WEBGL_debug_renderer_info")
                    .and_then(|_| gl.get_parameter(WebglDebugRendererInfo::UNMASKED_RENDERER_WEBGL))
                    .ok()
                    .and_then(|val| val.as_string())
                    .unwrap_or_else(|| "<unknown>".to_string());
                log::info!("WebGL graphics driver: {}", driver_info);
            }
        }

        Ok(WebGlRenderBackend { gl })
    }
}
