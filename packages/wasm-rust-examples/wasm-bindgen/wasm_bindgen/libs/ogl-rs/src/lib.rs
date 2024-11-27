mod program;
mod renderer;

use webgl_common::static_variables::{BlendEquation, BlendFactor};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlendFuncState {
    src: BlendFactor,
    dst: BlendFactor,
    src_alpha: Option<BlendFactor>,
    dst_alpha: Option<BlendFactor>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlendEquationState {
    mode_rgb: BlendEquation,
    mode_alpha: Option<BlendEquation>,
}
