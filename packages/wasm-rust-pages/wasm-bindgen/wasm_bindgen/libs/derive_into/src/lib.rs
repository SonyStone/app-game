extern crate proc_macro;
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(IntoU32)]
pub fn derive_into_u32(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = input.ident;

    let expanded = quote! {
        impl From<#name> for u32 {
            fn from(value: #name) -> Self {
                value as u32
            }
        }
    };

    TokenStream::from(expanded)
}
