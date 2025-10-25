extern crate proc_macro;

use std::collections::HashMap;

use itertools::Itertools;

#[derive(Debug)]
pub enum BindingRegister {
    UniformBuffers,
    StorageBuffers,
    Textures,
    Images,
}

pub fn convert_wgsl_to_glsl(
    wgsl_source: &str,
) -> Result<(String, String, HashMap<String, (String, BindingRegister)>), String> {
    let module =
        naga::front::wgsl::parse_str(wgsl_source).map_err(|e| e.emit_to_string(wgsl_source))?;

    let module_info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .map_err(|e| e.to_string())?;

    let naga_options = naga::back::glsl::Options {
        version: naga::back::glsl::Version::Embedded {
            version: 300,
            is_webgl: true,
        },
        ..naga::back::glsl::Options::default()
    };

    let mut name_binding_map = HashMap::new();

    let outs = [
        (naga::ShaderStage::Vertex, "vs_main"),
        (naga::ShaderStage::Fragment, "fs_main"),
    ]
    .iter()
    .map(
        |(shader_stage, entry_point)| naga::back::glsl::PipelineOptions {
            shader_stage: *shader_stage,
            entry_point: entry_point.to_string(),
            multiview: None,
        },
    )
    .map(|pipeline_options| {
        let bounds_check_policies = naga::proc::index::BoundsCheckPolicies::default();
        let mut output = String::new();
        let mut writer = naga::back::glsl::Writer::new(
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
