extern crate proc_macro;

use itertools::Itertools;
use naga::back::glsl;
use naga::front::wgsl;
use naga::valid::{Capabilities, ValidationFlags, Validator};
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, LitStr};

fn convert_wgsl_to_glsl(wgsl_source: &str) -> Result<(String, String), String> {
    let module = wgsl::parse_str(wgsl_source).map_err(|e| e.emit_to_string(wgsl_source))?;
    let mut validator = Validator::new(ValidationFlags::all(), Capabilities::all());
    let module_info = validator.validate(&module).map_err(|e| e.to_string())?;

    let glsl_options = glsl::Options {
        version: glsl::Version::Embedded {
            version: 300,
            is_webgl: true,
        },
        ..glsl::Options::default()
    };

    let outs = [
        (naga::ShaderStage::Vertex, "vs_main"),
        (naga::ShaderStage::Fragment, "fs_main"),
    ]
    .iter()
    .map(|(shader_stage, entry_point)| glsl::PipelineOptions {
        shader_stage: *shader_stage,
        entry_point: entry_point.to_string(),
        multiview: None,
    })
    .map(|pipeline_options| {
        let bounds_check_policies = naga::proc::index::BoundsCheckPolicies::default();
        let mut glsl_out = String::new();
        let mut glsl_writer = glsl::Writer::new(
            &mut glsl_out,
            &module,
            &module_info,
            &glsl_options,
            &pipeline_options,
            bounds_check_policies,
        )
        .map_err(|e| e.to_string())
        .unwrap();

        glsl_writer.write().map_err(|e| e.to_string()).unwrap();

        glsl_out
    })
    .collect_tuple::<(String, String)>()
    .unwrap();

    Ok(outs)
}

#[proc_macro]
pub fn wgsl_to_glsl(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as LitStr);
    let wgsl_source = input.value();

    let (vert_shader_source, frag_shader_source) =
        convert_wgsl_to_glsl(&wgsl_source).expect("Failed to convert shaders");

    let output = quote! {
        (#vert_shader_source, #frag_shader_source)
    };

    output.into()
}

/// whaiting for this featre #![feature(proc_macro_span)] will be available in stable
/// https://stackoverflow.com/questions/60738538/is-there-a-way-to-get-the-file-and-the-module-path-of-where-a-procedural-macro-i
///
/// For now need to use this full path

#[proc_macro]
pub fn include_wgsl_to_glsl(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as LitStr);
    let file_path = input.value();

    let wgsl_source = std::fs::read_to_string(&file_path).expect("Failed to read WGSL file");

    let (vert_shader_source, frag_shader_source) =
        convert_wgsl_to_glsl(&wgsl_source).expect("Failed to convert shaders");

    let output = quote! {
        (#vert_shader_source, #frag_shader_source)
    };

    output.into()
}

#[test]
fn get_glsl_from_wgsl() {
    let wgsl_source = r##"
    @binding(0) @group(0) var<uniform> frame : u32;
    @vertex
    fn vs_main(@builtin(vertex_index) vertex_index : u32) -> @builtin(position) vec4f {
    const pos = array(
        vec2( 0.0,  0.5),
        vec2(-0.5, -0.5),
        vec2( 0.5, -0.5)
    );

    return vec4f(pos[vertex_index], 0, 1);
    }

    @fragment
    fn fs_main() -> @location(0) vec4f {
    return vec4(1, sin(f32(frame) / 128), 0, 1);
    }
    "##;

    let (vert_shader_source, frag_shader_source) =
        convert_wgsl_to_glsl(wgsl_source).expect("Failed to convert shader");

    println!("{}", vert_shader_source);
    println!("{}", frag_shader_source);
}

#[test]
fn get_glsl_from_wgsl_2() {
    let wgsl_source = r##"
    @vertex
    fn vs_main(@location(0) pos: vec4f) -> @builtin(position) vec4f {
        return pos;
    }

    @fragment
    fn fs_main() -> @location(0) vec4f {
        return vec4f(1, 1, 1, 1);
    }
    "##;

    let (vert_shader_source, frag_shader_source) =
        convert_wgsl_to_glsl(wgsl_source).expect("Failed to convert shader");

    println!("{}", vert_shader_source);
    println!("{}", frag_shader_source);
}
