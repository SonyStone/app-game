//! Stable GDOC blend identifiers; 2 and 3 remain reserved for soft masks.
use hayro_interpret::BlendMode;

pub(super) fn encode(mode: BlendMode) -> u8 {
    match mode {
        BlendMode::Normal => 0,
        BlendMode::Multiply => 1,
        BlendMode::Screen => 4,
        BlendMode::Overlay => 5,
        BlendMode::Darken => 6,
        BlendMode::Lighten => 7,
        BlendMode::ColorDodge => 8,
        BlendMode::ColorBurn => 9,
        BlendMode::HardLight => 10,
        BlendMode::SoftLight => 11,
        BlendMode::Difference => 12,
        BlendMode::Exclusion => 13,
        BlendMode::Hue => 14,
        BlendMode::Saturation => 15,
        BlendMode::Color => 16,
        BlendMode::Luminosity => 17,
    }
}
