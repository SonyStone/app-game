//! Axis bins reduce fragment work without changing Bézier geometry or fill winding.

use crate::{container::u32_at, curves::f32_at, error::DocumentError};
use std::collections::{HashMap, HashSet};

/// Adds row/column lookup tables for shared outlines with more than 64 monotone segments.
pub(crate) fn build(
    curves: &[u8],
    draws: &mut [u8],
    clips: &mut [u8],
) -> Result<Vec<u8>, DocumentError> {
    build_with_budget(curves, draws, clips, MAX_BYTES)
}

// Bins are an acceleration structure. Reserve them for the largest outlines first;
// ordinary outlines can still use the exact bounded scan when the budget is full.
fn build_with_budget(
    curves: &[u8],
    draws: &mut [u8],
    clips: &mut [u8],
    budget: usize,
) -> Result<Vec<u8>, DocumentError> {
    let mut outlines = draws
        .chunks_exact(80)
        .chain(clips.chunks_exact(80))
        .filter(|record| u32_at(record, 72) != 2 && u32_at(record, 68) > 64)
        .map(|record| (u32_at(record, 64), u32_at(record, 68)))
        .collect::<Vec<_>>();
    outlines.sort_unstable_by_key(|&(first, count)| (std::cmp::Reverse(count), first));
    outlines.dedup();
    let mut data = vec![0u8; 4];
    let mut known = HashMap::new();

    for (first, count) in outlines {
        let offset = match append(curves, first, count, &mut data, budget) {
            Ok(offset) => offset,
            Err(DocumentError::Limit("curve bins")) if count <= 4096 => 0,
            Err(error) => return Err(error),
        };
        known.insert((first, count), offset);
    }

    for record in draws.chunks_exact_mut(80).chain(clips.chunks_exact_mut(80)) {
        if u32_at(record, 72) == 2 {
            continue;
        }
        let key = (u32_at(record, 64), u32_at(record, 68));
        if let Some(offset) = known.get(&key) {
            record[28..32].copy_from_slice(&offset.to_le_bytes());
        }
    }

    Ok(if data.len() == 4 { Vec::new() } else { data })
}

/// Validates each shared lookup once. References must remain inside the owning outline.
pub(crate) fn validate(data: &[u8], draws: &[u8], clips: &[u8]) -> Result<(), DocumentError> {
    if !data.len().is_multiple_of(4) || data.len() > MAX_BYTES {
        return Err(DocumentError::Limit("curve bins"));
    }
    let mut checked = HashSet::new();

    for record in draws.chunks_exact(80).chain(clips.chunks_exact(80)) {
        let offset = u32_at(record, 28) as usize;
        let first = u32_at(record, 64);
        let count = u32_at(record, 68);
        if offset == 0 {
            if count > 4096 {
                return Err(DocumentError::Invalid("large outline needs curve bins"));
            }
            continue;
        }
        if u32_at(record, 72) == 2 || offset > data.len() / 4 || 512 > data.len() / 4 - offset {
            return Err(DocumentError::Invalid("curve bin table"));
        }
        if !checked.insert((offset, first, count)) {
            continue;
        }

        for row in 0..256 {
            let start = u32_at(data, (offset + row * 2) * 4) as usize;
            let len = u32_at(data, (offset + row * 2 + 1) * 4) as usize;
            if start > data.len() / 4 || len > data.len() / 4 - start || len > count as usize {
                return Err(DocumentError::Invalid("curve bin range"));
            }
            let mut previous = None;
            for entry in data[start * 4..(start + len) * 4].chunks_exact(4) {
                let index = u32_at(entry, 0);
                if index < first || index - first >= count || previous.is_some_and(|p| index <= p) {
                    return Err(DocumentError::Invalid("curve bin index"));
                }
                previous = Some(index);
            }
        }
    }
    Ok(())
}

fn append(
    curves: &[u8],
    first: u32,
    count: u32,
    data: &mut Vec<u8>,
    budget: usize,
) -> Result<u32, DocumentError> {
    if count > 65536
        || first as usize > curves.len() / 32
        || count as usize > curves.len() / 32 - first as usize
    {
        return Err(DocumentError::Invalid("curve bin source range"));
    }
    let mut rows = vec![Vec::<u32>::new(); 256];
    for index in first..first + count {
        let curve = &curves[index as usize * 32..(index as usize + 1) * 32];
        for (axis, base) in [(4, 0), (0, 128)] {
            let start = f32_at(curve, axis);
            let end = f32_at(curve, axis + 24);
            let lo = ((start.min(end) * 128.0).floor() as i32).clamp(0, 127) as usize;
            let hi = ((start.max(end) * 128.0).floor() as i32).clamp(0, 127) as usize;
            for row in &mut rows[base + lo..=base + hi] {
                row.push(index);
            }
        }
    }
    let offset = data.len() / 4;
    let size = 512 * 4 + rows.iter().map(|r| r.len() * 4).sum::<usize>();
    if size > budget.saturating_sub(data.len()) {
        return Err(DocumentError::Limit("curve bins"));
    }
    data.resize(data.len() + 512 * 4, 0);
    for (i, row) in rows.into_iter().enumerate() {
        let start = (data.len() / 4) as u32;
        let location = (offset + i * 2) * 4;
        data[location..location + 4].copy_from_slice(&start.to_le_bytes());
        data[location + 4..location + 8].copy_from_slice(&(row.len() as u32).to_le_bytes());
        for index in row {
            data.extend_from_slice(&index.to_le_bytes());
        }
    }
    Ok(offset as u32)
}

const MAX_BYTES: usize = 32 * 1024 * 1024;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_bins_do_not_reject_valid_geometry_when_budget_is_full() {
        let curves = vec![0; 65 * 32];
        let mut draw = vec![0; 80];
        draw[68..72].copy_from_slice(&65u32.to_le_bytes());
        let bins = build_with_budget(&curves, &mut draw, &mut [], 4).unwrap();
        assert!(bins.is_empty());
        validate(&bins, &draw, &[]).unwrap();
    }

    #[test]
    fn mandatory_bins_take_priority_over_earlier_small_outlines() {
        let curves = vec![0; (65 + 4097) * 32];
        let mut draws = vec![0; 160];
        draws[68..72].copy_from_slice(&65u32.to_le_bytes());
        draws[144..148].copy_from_slice(&65u32.to_le_bytes());
        draws[148..152].copy_from_slice(&4097u32.to_le_bytes());
        let bins = build_with_budget(&curves, &mut draws, &mut [], 4 + 2048 + 4097 * 8).unwrap();
        assert_eq!(u32_at(&draws, 28), 0);
        assert_ne!(u32_at(&draws, 108), 0);
        validate(&bins, &draws, &[]).unwrap();
    }

    #[test]
    fn mandatory_bins_still_reject_an_insufficient_budget() {
        let curves = vec![0; 4097 * 32];
        let mut draw = vec![0; 80];
        draw[68..72].copy_from_slice(&4097u32.to_le_bytes());
        assert!(matches!(
            build_with_budget(&curves, &mut draw, &mut [], 4),
            Err(DocumentError::Limit("curve bins"))
        ));
    }
}
