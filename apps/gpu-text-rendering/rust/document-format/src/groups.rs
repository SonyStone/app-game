//! Validation for retained isolated transparency groups.
use crate::{
    container::u32_at,
    curves::{Page, f32_at},
    error::DocumentError,
};

pub(crate) fn validate(groups: &[u8], pages: &[Page]) -> Result<(), DocumentError> {
    if !groups.len().is_multiple_of(24) || groups.len() / 24 > 100_000 {
        return Err(DocumentError::Limit("transparency group records"));
    }
    let mut stack: Vec<usize> = Vec::new();
    let mut previous = 0;
    for (index, record) in groups.chunks_exact(24).enumerate() {
        let first = u32_at(record, 0);
        let end = u32_at(record, 4);
        let parent = u32_at(record, 16) as usize;
        let page = pages
            .get(u32_at(record, 20) as usize)
            .ok_or(DocumentError::Invalid("group page"))?;
        if first < previous
            || first > end
            || first < page.first
            || end > page.first + page.count
            || !(0.0..=1.0).contains(&f32_at(record, 8))
            || u32_at(record, 12) & !0x3ff != 0
            || (u32_at(record, 12) & 255) > 17
            || (matches!(u32_at(record, 12) & 255, 2 | 3) && u32_at(record, 12) > 255)
            || parent > index
        {
            return Err(DocumentError::Invalid("group range/opacity/blend"));
        }
        while stack.last().is_some_and(|last| *last + 1 != parent) {
            let sibling = stack.pop().ok_or(DocumentError::Invalid("group parent"))?;
            if first < u32_at(groups, sibling * 24 + 4) {
                return Err(DocumentError::Invalid("overlapping group siblings"));
            }
        }
        if parent != stack.last().map_or(0, |last| *last + 1)
            || (parent > 0
                && (end > u32_at(groups, (parent - 1) * 24 + 4)
                    || u32_at(record, 20) != u32_at(groups, (parent - 1) * 24 + 20)))
        {
            return Err(DocumentError::Invalid("group parent/range"));
        }
        if matches!(u32_at(record, 12), 2 | 3)
            && (parent == 0
                || index != parent
                || matches!(u32_at(groups, (parent - 1) * 24 + 12) & 255, 2 | 3))
        {
            return Err(DocumentError::Invalid(
                "mask must be first child of a paint group",
            ));
        }
        stack.push(index);
        if stack.len() > 32 {
            return Err(DocumentError::Limit("transparency group depth"));
        }
        previous = first;
    }
    Ok(())
}

/// Checks that each transfer table belongs to a distinct soft mask and contains finite samples.
pub(crate) fn validate_transfers(transfers: &[u8], groups: &[u8]) -> Result<(), DocumentError> {
    if !transfers.len().is_multiple_of(1028) {
        return Err(DocumentError::Invalid("mask transfer table length"));
    }
    let mut seen = std::collections::HashSet::new();
    for record in transfers.chunks_exact(1028) {
        let index = u32_at(record, 0) as usize;
        if index >= groups.len() / 24
            || !seen.insert(index)
            || !matches!(u32_at(groups, index * 24 + 12), 2 | 3)
            || record[4..]
                .chunks_exact(4)
                .any(|v| !(0.0..=1.0).contains(&f32_at(v, 0)))
        {
            return Err(DocumentError::Invalid("mask transfer table"));
        }
    }
    Ok(())
}
