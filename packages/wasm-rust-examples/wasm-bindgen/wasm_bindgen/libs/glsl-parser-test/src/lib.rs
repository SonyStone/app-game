use glsl::parser::Parse;
use glsl::syntax::{
    self, Declaration, Expr, ExternalDeclaration, FullySpecifiedType, InitDeclaratorList,
    LayoutQualifier, LayoutQualifierSpec, SingleDeclaration, StorageQualifier, TranslationUnit,
    TypeQualifier, TypeQualifierSpec, TypeSpecifier, TypeSpecifierNonArray,
};

#[test]
fn test() {
    let vs_glsl = include_str!("shader.vert");
    let fs_glsl = include_str!("shader.frag");

    let ast: TranslationUnit = syntax::TranslationUnit::parse(vs_glsl).unwrap();
    println!("🟢 {:#?}", ast);
    let (attributes, uniforms) = extract_attributes_and_uniforms(&ast);

    println!("-----------------");
    println!("🟢attributes: {:#?}", attributes);
    println!("🟢uniforms: {:#?}", uniforms);
    let ast = syntax::TranslationUnit::parse(fs_glsl).unwrap();
    // println!("🟢 {:#?}", ast);
}

fn extract_attributes_and_uniforms(
    ast: &TranslationUnit,
) -> (
    Vec<(String, TypeSpecifierNonArray)>,
    Vec<(String, TypeSpecifierNonArray)>,
) {
    let mut attributes = Vec::new();
    let mut uniforms = Vec::new();

    for node in &ast.0 {
        if let ExternalDeclaration::Declaration(Declaration::InitDeclaratorList(init_decl_list)) =
            node
        {
            let location = get_location(init_decl_list);
            let storage = get_storage_qualifier(init_decl_list);
            let name = get_name(init_decl_list).unwrap_or_default();
            let type_of_data = get_type(init_decl_list);

            println!("🟢 {:#?}", (&location, &storage, &name, &type_of_data));

            match storage {
                Some(StorageQualifier::In) => {
                    attributes.push((name, type_of_data));
                }
                Some(StorageQualifier::Uniform) => {
                    uniforms.push((name, type_of_data));
                }
                _ => {}
            }
        }
    }

    (attributes, uniforms)
}

fn get_storage_qualifier(init_decl_list: &InitDeclaratorList) -> Option<StorageQualifier> {
    init_decl_list
        .head
        .ty
        .qualifier
        .as_ref()
        .and_then(|qualifier| {
            qualifier.qualifiers.0.iter().find_map(|q| {
                if let TypeQualifierSpec::Storage(storage_qualifier) = q {
                    Some(storage_qualifier.clone())
                } else {
                    None
                }
            })
        })
}

fn get_name(init_decl_list: &InitDeclaratorList) -> Option<String> {
    Some(init_decl_list.head.name.as_ref()?.0.clone())
}

fn get_type(init_decl_list: &InitDeclaratorList) -> TypeSpecifierNonArray {
    init_decl_list.head.ty.ty.ty.clone()
}

fn get_location(init_decl_list: &InitDeclaratorList) -> Option<i32> {
    init_decl_list
        .head
        .ty
        .qualifier
        .as_ref()
        .and_then(|qualifier| {
            qualifier.qualifiers.0.iter().find_map(|q| match q {
                TypeQualifierSpec::Layout(layout_qualifier) => {
                    layout_qualifier.ids.0.iter().find_map(|id| match id {
                        LayoutQualifierSpec::Identifier(ident, None) => match ident.0.as_str() {
                            "location" => Some(0),
                            _ => None,
                        },
                        _ => None,
                    })
                }
                _ => None,
            })
        })
}
