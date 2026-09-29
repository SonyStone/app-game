//! Profile 1 glyph documents.
#![no_main]

use gpu_document::quadratic;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = quadratic::decode(data);
});
