extern crate proc_macro;

use std::collections::HashMap;

use itertools::Itertools;
use naga::back::glsl;
use naga::front::wgsl;
use naga::valid::{Capabilities, ValidationFlags, Validator};
use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{parse_macro_input, LitStr};

#[derive(Debug)]
enum BindingRegister {
    UniformBuffers,
    StorageBuffers,
    Textures,
    Images,
}

fn convert_wgsl_to_glsl(
    wgsl_source: &str,
) -> Result<(String, String, HashMap<String, (String, BindingRegister)>), String> {
    let module = wgsl::parse_str(wgsl_source).map_err(|e| e.emit_to_string(wgsl_source))?;
    let mut validator = Validator::new(ValidationFlags::all(), Capabilities::all());
    let module_info = validator.validate(&module).map_err(|e| e.to_string())?;

    let naga_options = glsl::Options {
        version: glsl::Version::Embedded {
            version: 300,
            is_webgl: true,
        },
        ..glsl::Options::default()
    };

    let mut name_binding_map = HashMap::new();

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
        let mut output = String::new();
        let mut writer = glsl::Writer::new(
            &mut output,
            &module,
            &module_info,
            &naga_options,
            &pipeline_options,
            bounds_check_policies,
        )
        .map_err(|e| e.to_string())
        .unwrap();

        let reflection_info = writer.write().map_err(|e| e.to_string()).unwrap();

        for (handle, var) in module.global_variables.iter() {
            let register = match var.space {
                naga::AddressSpace::Uniform => BindingRegister::UniformBuffers,
                naga::AddressSpace::Storage { .. } => BindingRegister::StorageBuffers,
                _ => continue,
            };

            let name = match reflection_info.uniforms.get(&handle) {
                Some(name) => name.clone(),
                None => continue,
            };

            if let Some(var_name) = var.name.clone() {
                name_binding_map.insert(var_name, (name, register));
            }
        }

        output
    })
    .collect_tuple::<(String, String)>()
    .unwrap();

    Ok((outs.0, outs.1, name_binding_map))
}

#[proc_macro]
pub fn wgsl_to_glsl(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as LitStr);
    let wgsl_source = input.value();

    let (vert_shader_source, frag_shader_source, name_binding_map) =
        convert_wgsl_to_glsl(&wgsl_source).expect("Failed to convert shaders");

    let name_binding_map_tokens = {
        let mut entries = Vec::new();
        for (key, (value_name, binding_register)) in name_binding_map {
            let key = LitStr::new(&key, proc_macro2::Span::call_site());
            let value_name = LitStr::new(&value_name, proc_macro2::Span::call_site());
            let binding_register_tokens = match binding_register {
                BindingRegister::UniformBuffers => quote! { BindingRegister::UniformBuffers },
                BindingRegister::StorageBuffers => quote! { BindingRegister::StorageBuffers },
                BindingRegister::Textures => quote! { BindingRegister::Textures },
                BindingRegister::Images => quote! { BindingRegister::Images },
            };
            entries.push(quote! {
                map.insert(
                    #key.to_string(),
                    (#value_name.to_string(), #binding_register_tokens)
                );
            });
        }
        quote! {
            {
                let mut map = ::std::collections::HashMap::new();
                #(#entries)*
                map
            }
        }
    };

    let output = quote! {
        (#vert_shader_source, #frag_shader_source, #name_binding_map_tokens)
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

    let (vert_shader_source, frag_shader_source, name_binding_map) =
        convert_wgsl_to_glsl(&wgsl_source).expect("Failed to convert shaders");

    let (struct_fields, struct_inits) = {
        // Generate struct fields and initializer
        let mut struct_fields = Vec::new();
        let mut struct_inits = Vec::new();
        for (key, (value_name, _binding_register)) in name_binding_map {
            let field_ident = format_ident!("{}", key);
            let value_lit = LitStr::new(&value_name, proc_macro2::Span::call_site());

            struct_fields.push(quote! {
                pub #field_ident: &'static str,
            });
            struct_inits.push(quote! {
                #field_ident: #value_lit,
            });
        }

        (struct_fields, struct_inits)
    };

    let output = quote! {
        {
            #[derive(Debug)]
            pub struct NameBindings {
                #(#struct_fields)*
            }
            let name_binding = NameBindings {
                #(#struct_inits)*
            };
            (#vert_shader_source, #frag_shader_source, name_binding)
        }
    };

    output.into()
}

#[test]
fn get_glsl_from_wgsl() {
    let wgsl_source = r##"

    struct TransformMatrices {
        projection_matrix: mat4x4f,
        view_matrix: mat4x4f,
    };
    @binding(1) @group(0) var<uniform> transforms: TransformMatrices;
    @binding(0) @group(0) var<uniform> frame : u32;

    @vertex
    fn vs_main(@builtin(vertex_index) vertex_index : u32) -> @builtin(position) vec4f {
        const pos = array(
            vec2( 0.0,  0.5),
            vec2(-0.5, -0.5),
            vec2( 0.5, -0.5)
        );

        return vec4f(pos[vertex_index], 0, 1) * transforms.projection_matrix * transforms.view_matrix;
    }

    @fragment
    fn fs_main() -> @location(0) vec4f {
        return vec4(1, sin(f32(frame) / 128), 0, 1);
    }
    "##;

    let (vert_shader_source, frag_shader_source, name_binding_map) =
        convert_wgsl_to_glsl(wgsl_source).expect("Failed to convert shader");

    println!("{}", vert_shader_source);
    println!("{}", frag_shader_source);
    println!("{:?}", name_binding_map);
}

#[test]
fn get_glsl_from_wgsl_2() {
    let wgsl_source = r##"

    @binding(0) @group(0) var<uniform> projection_matrix : mat4x4f;
    @binding(0) @group(1) var<uniform> model_view_matrix : mat4x4f;

    @vertex
    fn vs_main(@location(0) pos: vec4f) -> @builtin(position) vec4f {
        return pos * projection_matrix * model_view_matrix;
    }

    @fragment
    fn fs_main() -> @location(0) vec4f {
        return vec4f(1, 1, 1, 1);
    }
    "##;

    let (vert_shader_source, frag_shader_source, name_binding_map) =
        convert_wgsl_to_glsl(wgsl_source).expect("Failed to convert shader");

    println!("{}", vert_shader_source);
    println!("{}", frag_shader_source);
    println!("{:?}", name_binding_map);
}

#[test]
fn test_glsl_uniform_blocks() {
    let wgsl_source = r##"
    @binding(0) @group(0) var<uniform> projection_matrix : mat4x4f;

    @vertex
    fn vs_main(@location(0) position: vec4f) -> @builtin(position) vec4f {
        return position * projection_matrix;
    }

    @fragment
    fn fs_main() -> @location(0) vec4f {
        return vec4f(1, 1, 1, 1);
    }
    "##;

    let (vert_shader_source, frag_shader_source, name_binding_map) =
        convert_wgsl_to_glsl(wgsl_source).expect("Failed to convert shader");

    println!("{}", vert_shader_source);
    println!("{}", frag_shader_source);
    println!("{:?}", name_binding_map);
}
