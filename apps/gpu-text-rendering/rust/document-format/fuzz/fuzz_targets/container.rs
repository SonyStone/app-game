//! GDOC container framing for every profile, through both the borrowed and owned readers.
#![no_main]

use gpu_document::container;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    for profile in 1..=3 {
        let borrowed = container::decode_profile(data, profile);
        let owned = container::decode_profile_owned(data.to_vec(), profile);
        assert_eq!(borrowed, owned);
    }
});
