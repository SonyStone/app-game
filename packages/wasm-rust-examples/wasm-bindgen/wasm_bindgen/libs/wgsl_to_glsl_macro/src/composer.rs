use naga::{Binding, Module, ResourceBinding};

#[derive(Clone, Debug)]
pub struct Shader {
    pub stage: String,
    pub source: String,
    pub attributes: Vec<Attribute>,
    pub uniforms: Vec<Uniform>,
    pub textures: Vec<(String, String, ResourceBinding)>,
}

#[derive(Clone, Debug)]
pub struct Attribute {
    pub name: String,
    pub location: u32,
}

#[derive(Clone, Debug)]
pub struct Uniform {
    pub name: String,
    pub block_name: String,
    pub group: u32,
    pub block_binding: u32,
}

/**
 * Create a webgl2 glsl 300 es shader from a naga module
 */
pub fn create_shader(module: &Module) -> Result<Vec<Shader>, String> {
    let module_info = {
        let mut validator = naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        );

        validator.validate(module).map_err(|e| e.to_string())?
    };

    let options = naga::back::glsl::Options {
        version: naga::back::glsl::Version::Embedded {
            version: 300,
            is_webgl: true,
        },
        ..naga::back::glsl::Options::default()
    };

    module
        .entry_points
        .iter()
        .map(|entry_point| -> Result<Shader, String> {
            let (string, reflection_info) = {
                let mut string = String::new();
                let pipeline_options = naga::back::glsl::PipelineOptions {
                    shader_stage: entry_point.stage,
                    entry_point: entry_point.name.clone(),
                    multiview: None,
                };

                let mut writer = naga::back::glsl::Writer::new(
                    &mut string,
                    module,
                    &module_info,
                    &options,
                    &pipeline_options,
                    naga::proc::BoundsCheckPolicies::default(),
                )
                .map_err(|e| e.to_string())?;

                let reflection_info = writer.write().map_err(|e| e.to_string()).unwrap();

                (string, reflection_info)
            };

            let stage = match entry_point.stage {
                naga::ShaderStage::Vertex => "vertex",
                naga::ShaderStage::Fragment => "fragment",
                naga::ShaderStage::Compute => "compute",
            };
            let shader = (stage, string);

            let attributes = entry_point
                .function
                .arguments
                .iter()
                .filter_map(|argument| {
                    if let (Some(name), Some(Binding::Location { location, .. })) =
                        (argument.name.clone(), argument.binding.clone())
                    {
                        Some(Attribute { name, location })
                    } else {
                        None
                    }
                })
                .collect::<Vec<Attribute>>();

            let uniforms = module
                .global_variables
                .iter()
                .filter_map(|(handle, variable)| {
                    if let (Some(name), Some(binding), naga::AddressSpace::Uniform) = (
                        variable.name.clone(),
                        variable.binding.clone(),
                        variable.space,
                    ) {
                        reflection_info
                            .uniforms
                            .get(&handle)
                            .map(|block_name| Uniform {
                                name,
                                block_name: block_name.clone(),
                                group: binding.group,
                                block_binding: binding.binding,
                            })
                    } else {
                        None
                    }
                })
                .collect::<Vec<Uniform>>();

            Ok(Shader {
                stage: shader.0.to_string(),
                source: shader.1,
                attributes,
                uniforms,
                textures: Vec::new(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use naga_oil::compose::{ComposableModuleDescriptor, Composer, NagaModuleDescriptor};

    use crate::composer::create_shader;

    #[test]
    fn test_naga_oil_imports() {
        let mut composer = Composer::default();

        composer
            .add_composable_module(ComposableModuleDescriptor {
                source: include_str!("simple/inc.wgsl"),
                file_path: "simple/inc.wgsl",
                ..Default::default()
            })
            .map_err(|e| e.to_string())
            .unwrap();

        let module = composer
            .make_naga_module(NagaModuleDescriptor {
                source: include_str!("simple/top.wgsl"),
                file_path: "simple/top.wgsl",
                ..Default::default()
            })
            .map_err(|e| e.to_string())
            .unwrap();

        let strings = create_shader(&module).unwrap();

        println!("{:#?}", strings);
    }
}
