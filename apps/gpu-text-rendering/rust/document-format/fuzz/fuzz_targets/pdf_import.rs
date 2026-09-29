//! Whole PDF import. Inputs are capped so each run stays short; limits are exercised by
//! the decoders' own caps rather than by input size.
#![no_main]

use gpu_document::pdf;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() > 256 * 1024 {
        return;
    }
    let _ = pdf::import_owned(data.to_vec());
});
