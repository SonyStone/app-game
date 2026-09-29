//! Retained CMYK/YCCK JPEG decoding; the first four bytes choose bounded dimensions.
#![no_main]

use gpu_document::raster_jpeg;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 4 {
        return;
    }
    let width = u32::from(u16::from_le_bytes([data[0], data[1]]) % 2048) + 1;
    let height = u32::from(u16::from_le_bytes([data[2], data[3]]) % 2048) + 1;
    let _ = raster_jpeg::decode(&data[4..], width, height);
});
