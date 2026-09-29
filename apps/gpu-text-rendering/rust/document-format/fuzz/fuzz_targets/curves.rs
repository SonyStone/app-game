//! Profile 2/3 scene validation, including images, bins, clips and groups.
#![no_main]

use gpu_document::curves;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let borrowed = curves::decode(data).map(|document| format!("{document:?}"));
    let owned = curves::decode_owned(data.to_vec()).map(|document| format!("{document:?}"));
    assert_eq!(borrowed, owned);
});
