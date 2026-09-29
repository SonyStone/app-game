//! Axis bins reduce fragment work without changing Bézier geometry or fill winding.

use crate::{container::u32_at, curves::f32_at, error::DocumentError};
use std::collections::HashMap;

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

/// Validates every referenced lookup table in time linear in the BINS and record counts.
///
/// Each distinct table offset is summarized once (its longest row and the smallest and
/// largest curve index it lists), and every row is checked in O(1) against a precomputed
/// strictly-ascending run table. A draw or clip then only compares that summary with its own
/// `first..first + count` curve range, so many records sharing or overlapping large row lists
/// cannot multiply the scan cost.
pub(crate) fn validate(data: &[u8], draws: &[u8], clips: &[u8]) -> Result<(), DocumentError> {
    if !data.len().is_multiple_of(4) || data.len() > MAX_BYTES {
        return Err(DocumentError::Limit("curve bins"));
    }
    let words = data.len() / 4;
    let mut runs = None;
    let mut tables = HashMap::new();

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
        if u32_at(record, 72) == 2 || offset > words || 512 > words - offset {
            return Err(DocumentError::Invalid("curve bin table"));
        }
        let summary = match tables.get(&offset) {
            Some(summary) => *summary,
            None => {
                let runs = runs.get_or_insert_with(|| ascending_runs(data));
                let summary = summarize(data, runs, offset)?;
                tables.insert(offset, summary);
                summary
            }
        };
        if summary.longest > count as usize
            || summary
                .indices
                .is_some_and(|(min, max)| min < first || max - first >= count)
        {
            return Err(DocumentError::Invalid("curve bin index"));
        }
    }
    Ok(())
}

/// Record-independent facts about one 256-row table; `indices` is `None` when every row is empty.
#[derive(Clone, Copy)]
struct TableSummary {
    longest: usize,
    indices: Option<(u32, u32)>,
}

/// Checks each row's range and strict ordering once, then keeps only its extreme indices.
fn summarize(data: &[u8], runs: &[u32], offset: usize) -> Result<TableSummary, DocumentError> {
    let words = data.len() / 4;
    let mut summary = TableSummary {
        longest: 0,
        indices: None,
    };
    for row in 0..256 {
        let start = u32_at(data, (offset + row * 2) * 4) as usize;
        let len = u32_at(data, (offset + row * 2 + 1) * 4) as usize;
        if start > words || len > words - start || len > 65536 {
            return Err(DocumentError::Invalid("curve bin range"));
        }
        if len == 0 {
            continue;
        }
        if start + len > runs[start] as usize {
            return Err(DocumentError::Invalid("curve bin index"));
        }
        let (low, high) = (u32_at(data, start * 4), u32_at(data, (start + len - 1) * 4));
        summary.longest = summary.longest.max(len);
        summary.indices = Some(
            summary
                .indices
                .map_or((low, high), |(min, max)| (min.min(low), max.max(high))),
        );
    }
    Ok(summary)
}

/// For each word `i`, the exclusive end of the longest strictly ascending run starting at `i`.
fn ascending_runs(data: &[u8]) -> Vec<u32> {
    let words = data.len() / 4;
    let mut runs = vec![0u32; words];
    for i in (0..words).rev() {
        runs[i] = if i + 1 < words && u32_at(data, i * 4) < u32_at(data, (i + 1) * 4) {
            runs[i + 1]
        } else {
            (i + 1) as u32
        };
    }
    runs
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

    #[test]
    fn shared_and_overlapping_large_rows_are_validated_once() {
        // 256 tables whose 256 rows each point into one 65,536-entry ascending list at a
        // different start. The former per-(offset, first, count) scan needed ~4.3e9 checks.
        let tables = 256usize;
        let list = 1 + tables * 512;
        let mut words = vec![0u32; list + 65536];
        for (i, word) in words[list..].iter_mut().enumerate() {
            *word = i as u32;
        }
        for table in 0..tables {
            for row in 0..256 {
                let at = 1 + table * 512 + row * 2;
                words[at] = (list + table) as u32;
                words[at + 1] = (65536 - table) as u32;
            }
        }
        let data: Vec<u8> = words.iter().flat_map(|w| w.to_le_bytes()).collect();
        let mut draws = vec![0u8; tables * 4 * 80];
        for (index, draw) in draws.chunks_exact_mut(80).enumerate() {
            draw[28..32].copy_from_slice(&((1 + (index % tables) * 512) as u32).to_le_bytes());
            draw[68..72].copy_from_slice(&65536u32.to_le_bytes());
        }
        let started = std::time::Instant::now();
        validate(&data, &draws, &[]).unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(2));

        // Indices outside a referencing draw's own range are still rejected.
        draws[64..68].copy_from_slice(&1u32.to_le_bytes());
        assert_eq!(
            validate(&data, &draws, &[]),
            Err(DocumentError::Invalid("curve bin index"))
        );
        // Non-ascending rows are rejected even when shared.
        let mut unordered = data.clone();
        let at = (list + 100) * 4;
        unordered[at..at + 4].copy_from_slice(&0u32.to_le_bytes());
        draws[64..68].copy_from_slice(&0u32.to_le_bytes());
        assert_eq!(
            validate(&unordered, &draws, &[]),
            Err(DocumentError::Invalid("curve bin index"))
        );
    }
}
