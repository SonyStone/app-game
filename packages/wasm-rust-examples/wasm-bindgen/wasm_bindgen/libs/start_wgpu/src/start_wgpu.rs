use std::borrow::Cow;

use wasm_bindgen::prelude::*;
use web_sys::console;
use wgpu::{InstanceDescriptor, SurfaceTarget};

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
struct HelloTriangle {
    canvas: web_sys::HtmlCanvasElement,
    instance: wgpu::Instance,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    adapter: wgpu::Adapter,
    device: wgpu::Device,
    queue: wgpu::Queue,
    shader: wgpu::ShaderModule,
    pipeline_layout: wgpu::PipelineLayout,
    swapchain_capabilities: wgpu::SurfaceCapabilities,
    swapchain_format: wgpu::TextureFormat,
    render_pipeline: wgpu::RenderPipeline,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl HelloTriangle {
    pub async fn new(canvas: web_sys::HtmlCanvasElement) -> Result<Self, JsValue> {
        let instance = wgpu::Instance::new(InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..InstanceDescriptor::default()
        });
        let surface_target = SurfaceTarget::Canvas(canvas.clone());
        let surface = instance
            .create_surface(surface_target)
            .inspect_err(|e| console::error_1(&format!("{:?}", e).into()))
            .expect("Failed to create surface");

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .expect("Failed to find an appropriate adapter");

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await
            .expect("Failed to create device");

        // Load the shaders from disk
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("start_wgpu.wgsl"))),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[],
            push_constant_ranges: &[],
        });

        let swapchain_capabilities = surface.get_capabilities(&adapter);
        let swapchain_format = swapchain_capabilities.formats[0];

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(swapchain_format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let config = surface
            .get_default_config(&adapter, canvas.width(), canvas.height())
            .unwrap();
        surface.configure(&device, &config);

        let app = Self {
            canvas,
            instance,
            config,
            surface,
            adapter,
            device,
            queue,
            shader,
            pipeline_layout,
            swapchain_capabilities,
            swapchain_format,
            render_pipeline,
        };

        Ok(app)
    }

    pub fn resize(&mut self, height: u32, width: u32) {
        self.config.height = height;
        self.config.width = width;
        self.surface.configure(&self.device, &self.config);
        self.redraw()
    }

    pub fn redraw(&self) {
        let frame = self
            .surface
            .get_current_texture()
            .expect("Failed to acquire next swap chain texture");
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        {
            let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::GREEN),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            rpass.set_pipeline(&self.render_pipeline);
            rpass.draw(0..3, 0..1);
        }

        self.queue.submit(Some(encoder.finish()));
        frame.present();
    }
}
