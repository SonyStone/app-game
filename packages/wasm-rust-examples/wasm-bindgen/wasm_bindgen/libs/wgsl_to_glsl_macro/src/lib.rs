extern crate proc_macro;

use std::{
    env,
    sync::{LazyLock, Mutex},
};

use composer::{create_shader, Attribute, Shader, Uniform};
use naga_oil::compose::{ComposableModuleDescriptor, Composer, NagaModuleDescriptor};
use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{parse_macro_input, LitInt, LitStr};

mod composer;
mod wgsl_to_glsl;

#[proc_macro]
pub fn wgsl_to_glsl(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as LitStr);
    let wgsl_source = input.value();

    let (vert_shader_source, frag_shader_source, name_binding_map) =
        wgsl_to_glsl::convert_wgsl_to_glsl(&wgsl_source).expect("Failed to convert shaders");

    let name_binding_map_tokens = {
        let mut entries = Vec::new();
        for (key, (value_name, binding_register)) in name_binding_map {
            let key = LitStr::new(&key, proc_macro2::Span::call_site());
            let value_name = LitStr::new(&value_name, proc_macro2::Span::call_site());
            let binding_register_tokens = match binding_register {
                wgsl_to_glsl::BindingRegister::UniformBuffers => {
                    quote! { BindingRegister::UniformBuffers }
                }
                wgsl_to_glsl::BindingRegister::StorageBuffers => {
                    quote! { BindingRegister::StorageBuffers }
                }
                wgsl_to_glsl::BindingRegister::Textures => quote! { BindingRegister::Textures },
                wgsl_to_glsl::BindingRegister::Images => quote! { BindingRegister::Images },
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
        wgsl_to_glsl::convert_wgsl_to_glsl(&wgsl_source).expect("Failed to convert shaders");

    println!("file? {:?}", file!());

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

static COMPOSER: LazyLock<Mutex<naga_oil::compose::Composer>> =
    LazyLock::new(|| Mutex::new(Composer::default()));

#[proc_macro]
pub fn add_composable_module(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as LitStr);
    let file_path = input.value();
    let source = std::fs::read_to_string(&file_path).expect("Failed to read WGSL file");

    let mut composer = COMPOSER.lock().unwrap();

    composer
        .add_composable_module(ComposableModuleDescriptor {
            source: source.as_str(),
            file_path: &file_path,
            ..Default::default()
        })
        .map_err(|e| e.to_string())
        .unwrap();

    let output = quote! { ()};
    output.into()
}

#[proc_macro]
pub fn make_naga_module(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as LitStr);
    let file_path = input.value();
    let source = std::fs::read_to_string(&file_path).expect("Failed to read WGSL file");

    let mut composer = COMPOSER.lock().unwrap();

    let module = composer
        .make_naga_module(NagaModuleDescriptor {
            source: source.as_str(),
            file_path: &file_path,
            ..Default::default()
        })
        .map_err(|e| e.to_string())
        .unwrap();

    let shaders = create_shader(&module).unwrap();

    let (struct_fields, struct_inits) = {
        // Generate struct fields and initializer
        let mut struct_fields = Vec::new();
        let mut struct_inits = Vec::new();
        for (Shader {
            stage,
            source,
            attributes,
            uniforms,
            textures,
        }) in shaders
        {
            {
                let field_ident = format_ident!("{}", stage);
                struct_fields.push(quote! {
                    pub #field_ident: &'static str,
                });
                let value_lit = LitStr::new(&source, proc_macro2::Span::call_site());
                struct_inits.push(quote! {
                    #field_ident: #value_lit,
                });
            }
            {
                for Attribute { name, location } in attributes {
                    let field_ident = format_ident!("{}_attribute_location", name);
                    struct_fields.push(quote! {
                        pub #field_ident: u32,
                    });
                    let value_lit =
                        LitInt::new(&location.to_string(), proc_macro2::Span::call_site());
                    struct_inits.push(quote! {
                        #field_ident: #value_lit,
                    });
                }
            }
            {
                for Uniform {
                    name,
                    block_name,
                    group,
                    block_binding,
                } in uniforms
                {
                    let field_ident = format_ident!("{}_uniform_block_name", name);
                    struct_fields.push(quote! {
                        pub #field_ident: &'static str,
                    });
                    let value_lit = LitStr::new(&block_name, proc_macro2::Span::call_site());
                    struct_inits.push(quote! {
                        #field_ident: #value_lit,
                    });

                    let field_ident = format_ident!("{}_uniform_group", name);
                    struct_fields.push(quote! {
                        pub #field_ident: u32,
                    });
                    let value_lit = LitInt::new(&group.to_string(), proc_macro2::Span::call_site());
                    struct_inits.push(quote! {
                        #field_ident: #value_lit,
                    });

                    let field_ident = format_ident!("{}_uniform_binding", name);
                    struct_fields.push(quote! {
                        pub #field_ident: u32,
                    });
                    let value_lit =
                        LitInt::new(&block_binding.to_string(), proc_macro2::Span::call_site());
                    struct_inits.push(quote! {
                        #field_ident: #value_lit,
                    });
                }
            }
        }

        (struct_fields, struct_inits)
    };

    let output = quote! { {
        #[derive(Clone, Debug)]
        pub struct ShaderData {
            #(#struct_fields)*
        }
        let shader_data = ShaderData {
            #(#struct_inits)*
        };
        (shader_data)
    }
    };

    output.into()
}
