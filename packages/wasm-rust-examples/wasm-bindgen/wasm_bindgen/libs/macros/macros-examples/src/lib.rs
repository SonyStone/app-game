extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro2::TokenTree;
use quote::quote;
use syn::{
    parse_macro_input, punctuated::Punctuated, Attribute, Ident, ItemStruct, Lit, Meta, Path,
    Token, Type, TypeArray, TypePath,
};

// #[proc_macro]
#[proc_macro_derive(HelperAttr, attributes(location))]
pub fn verify_struct(attr: TokenStream) -> TokenStream {
    println!("❓ attr: \"{attr}\"");

    let input = parse_macro_input!(attr as ItemStruct);

    println!("❓ item: {:#?}", input);

    let struct_name = input.ident.to_string();
    let fieslds_names = input
        .fields
        .iter()
        .map(|field| field.ident.as_ref().unwrap().to_string())
        .collect::<Vec<String>>();
    let field_locations = input
        .fields
        .iter()
        .flat_map(|field| {
            let a = field
                .attrs
                .iter()
                .filter_map(|attr| {
                    println!("❓ attr: {:#?}", attr.path().is_ident("location"));
                    println!("❓ attr: {:#?}", attr.meta);

                    match attr.meta.clone() {
                        Meta::List(meta_list) => Some(
                            meta_list
                                .tokens
                                .into_iter()
                                .filter_map(|token| match token {
                                    TokenTree::Literal(literal) => {
                                        Some(literal.to_string().parse::<u32>().unwrap())
                                    }
                                    _ => None,
                                })
                                .collect::<Vec<u32>>(),
                        ),
                        _ => None,
                    }
                })
                .flatten()
                .collect::<Vec<u32>>();

            a
        })
        .collect::<Vec<u32>>();

    println!("❓ struct_name: {:#?}", struct_name);
    println!("❓ fieslds_names: {:#?}", fieslds_names);
    println!("❓ field_locations: {:#?}", field_locations);

    "".parse().unwrap()
}

#[proc_macro]
pub fn glsl_parser(input: TokenStream) -> TokenStream {
    println!("❓ input: \"{input}\"");

    let args = parse_macro_input!(input as Args);

    println!("❓ args: {:#?}", args);

    "".parse().unwrap()
}

#[derive(Debug)]
struct Args {
    idents: Punctuated<Ident, Token![,]>,
}

impl syn::parse::Parse for Args {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let idents = Punctuated::parse_separated_nonempty(input)?;
        Ok(Args { idents })
    }
}
