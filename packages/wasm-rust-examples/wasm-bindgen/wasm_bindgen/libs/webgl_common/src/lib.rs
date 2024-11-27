mod static_variables;
pub use static_variables::*;

mod common_structs;
pub use common_structs::*;

/// Converts a single value to a byte slice.
pub fn value_as_u8_slice<T>(p: &T) -> &[u8] {
    unsafe { core::slice::from_raw_parts((p as *const T) as *const u8, core::mem::size_of_val(p)) }
}

/// Converts a slice of values to a byte slice.
pub fn slice_as_u8_slice<T>(vec: &[T]) -> &[u8] {
    unsafe { core::slice::from_raw_parts(vec.as_ptr() as *const u8, core::mem::size_of_val(vec)) }
}
