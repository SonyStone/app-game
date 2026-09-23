//! Versioned GPU document files, independent of PDF and browser/GPU ownership.
//!
//! `container` validates framing, compression and integrity. `quadratic` is the
//! initial prepared-glyph profile; future importers can write it without BMPs.

pub mod container;
mod curve_bins;
pub mod curves;
pub mod error;
mod groups;
pub mod quadratic;
pub mod raster;
pub mod raster_jpeg;
pub mod raster_tiles;

#[cfg(feature = "pdf")]
pub mod pdf;

#[cfg(feature = "wasm")]
pub mod wasm;

mod limits;
