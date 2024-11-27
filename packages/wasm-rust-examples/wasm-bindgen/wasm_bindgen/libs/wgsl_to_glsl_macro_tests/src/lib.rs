pub fn add(left: usize, right: usize) -> usize {
    left + right
}

#[cfg(test)]
mod tests {
    use wgsl_to_glsl_macro::{add_composable_module, make_naga_module};

    #[test]
    fn test_naga_macros() {
        add_composable_module!("libs/wgsl_to_glsl_macro_tests/src/simple/inc.wgsl");
        let shader = make_naga_module!("libs/wgsl_to_glsl_macro_tests/src/simple/top.wgsl");
        println!("🫠 {:#?}", shader);
    }
}
