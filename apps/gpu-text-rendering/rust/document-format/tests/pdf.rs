//! End-to-end conversion and profile validation against generated PDF streams.
#![cfg(feature = "pdf")]

use gpu_document::{container, curves, pdf};

#[test]
fn import_reports_completed_pages_without_changing_output() {
    let bytes = fixture("0 0 10 10 re f", "");
    let mut progress = Vec::new();
    let scene = pdf::import_owned_with_progress(bytes.clone(), |done, total| progress.push((done, total))).unwrap();
    let expected = pdf::import_owned(bytes).unwrap();
    assert_eq!(progress, vec![(0, 1), (1, 1)]);
    assert_eq!(scene.instances, expected.instances);
    assert_eq!(scene.curves, expected.curves);
}

#[test]
fn preserves_cubics_holes_clipping_and_reuses_glyph_outlines() {
    let bytes = fixture(
        "0 0 1 rg 10 10 m 20 90 80 90 90 10 c h f\n0 0 0 rg 10 10 80 80 re 30 30 40 40 re f*\nq 20 20 60 60 re W n 0 0 100 100 re f Q\nBT /F1 12 Tf 10 50 Td (AAA) Tj ET",
        "",
    );
    let encoded = pdf::convert(&bytes).unwrap();
    let scene = curves::decode(&encoded).unwrap();
    assert_eq!(scene.pages.len(), 1);
    assert_eq!(scene.pages[0].count, 6);
    let draws = &scene.instances;
    assert_eq!(
        &draws[3 * 80 + 64..3 * 80 + 72],
        &draws[4 * 80 + 64..4 * 80 + 72]
    );
    assert_eq!(
        &draws[4 * 80 + 64..4 * 80 + 72],
        &draws[5 * 80 + 64..5 * 80 + 72]
    );
    assert_eq!(read_u32(draws, 80 + 72), 1);
    assert_eq!(read_f32(draws, 2 * 80 + 48), 0.2);
    assert_eq!(read_f32(draws, 2 * 80 + 56), 0.8);
    // A cubic stays cubic: control points differ from the straight-line thirds.
    assert!(
        scene
            .curves
            .chunks_exact(32)
            .any(
                |c| (read_f32(c, 12) - (read_f32(c, 4) * 2.0 + read_f32(c, 28)) / 3.0).abs() > 0.01
            )
    );
}

#[test]
fn applies_page_rotation_and_crop_to_geometry() {
    let scene = curves::decode(
        &pdf::convert(&fixture(
            "0 0 10 10 re f",
            "/MediaBox [0 0 200 100] /CropBox [0 0 150 80] /Rotate 90",
        ))
        .unwrap(),
    )
    .unwrap();
    assert_eq!((scene.pages[0].width, scene.pages[0].height), (80.0, 150.0));
    assert!(read_f32(&scene.instances, 4).abs() > 0.01);
    assert!(read_f32(&scene.instances, 8).abs() > 0.01);
}

#[test]
fn blank_pages_are_valid() {
    let scene = curves::decode(&pdf::convert(&fixture("", "")).unwrap()).unwrap();
    assert_eq!(scene.pages[0].count, 0);
    assert!(scene.curves.is_empty());
}

#[test]
fn retains_extended_blends_and_requires_the_extension_when_reopening() {
    let bytes = pdf::convert(&fixture_resources(
        "/GS gs 0 0 10 10 re f",
        "",
        "/ExtGState << /GS << /BM /Difference >> >>",
        &[],
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(scene.blends, [12]);
    let mut sections = container::decode_profile(&bytes, 2).unwrap();
    sections.retain(|s| s.tag != *b"BLNX");
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn rejects_invalid_curve_ranges_and_non_monotone_segments() {
    let bytes = pdf::convert(&fixture("0 0 10 10 re f", "")).unwrap();
    let mut sections = container::decode_profile(&bytes, 2).unwrap();
    let draws = sections.iter_mut().find(|s| s.tag == *b"DRAW").unwrap();
    draws.data[64..68].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
    let mut sections = container::decode_profile(&bytes, 2).unwrap();
    let curves = sections.iter_mut().find(|s| s.tag == *b"CURV").unwrap();
    curves.data[8..12].copy_from_slice(&(-10.0f32).to_le_bytes());
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn accepts_monotone_curves_whose_control_handles_extend_beyond_the_outline_bounds() {
    let encoded = pdf::convert(&fixture("0 0 m 110 30 50 60 100 90 c h f", "")).unwrap();
    let scene = curves::decode(&encoded).unwrap();
    assert!(scene.curves.chunks_exact(32).any(|c| read_f32(c, 8) > 1.0));
}

#[test]
fn rejects_invalid_instance_numbers_pages_and_flags_after_valid_container_checksums() {
    let bytes = pdf::convert(&fixture("0 0 10 10 re f", "")).unwrap();
    for (tag, offset, bits) in [
        (*b"CURV", 0, f32::NAN.to_bits()),
        (*b"DRAW", 0, 0),                  // Singular affine.
        (*b"DRAW", 32, 2.0_f32.to_bits()), // Color outside [0,1].
        (*b"DRAW", 48, 2.0_f32.to_bits()), // Inverted clipping bounds.
        (*b"DRAW", 68, 4097),
        (*b"DRAW", 72, 2),
        (*b"DRAW", 76, 1), // Mismatched page.
        (*b"PAGE", 16, 1), // Noncontiguous instance range.
    ] {
        let mut sections = container::decode_profile(&bytes, 2).unwrap();
        let section = sections.iter_mut().find(|s| s.tag == tag).unwrap();
        section.data[offset..offset + 4].copy_from_slice(&bits.to_le_bytes());
        let encoded = container::encode_profile(&sections, 2).unwrap();
        assert!(
            curves::decode(&encoded).is_err(),
            "accepted {tag:?} at {offset}"
        );
    }
}

#[test]
fn expands_strokes_and_keeps_holes_and_dash_components() {
    let scene = curves::decode(&pdf::convert(&fixture("4 w 1 J 1 j 10 10 m 90 10 l 90 90 l S 0 J [5 3] 2 d 10 50 m 90 50 l S BT /F1 15 Tf 1 Tr 10 70 Td (A) Tj ET", "")).unwrap()).unwrap();
    assert!(scene.pages[0].count > 5);
    assert!(
        scene
            .instances
            .chunks_exact(80)
            .all(|r| read_u32(r, 72) == 0)
    );
    assert!(
        scene
            .curves
            .chunks_exact(32)
            .any(|c| read_f32(c, 8) != read_f32(c, 0))
    );
}

#[test]
fn keeps_nested_clip_chains_and_restores_parent_after_pop() {
    let bytes = pdf::convert(&fixture("q 0 0 m 100 0 l 50 100 l h W n 0 0 100 100 re f q 10 10 m 90 10 l 50 90 l h W* n 0 0 100 100 re f Q 0 0 100 100 re f Q 0 0 100 100 re f", "")).unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(scene.clips.len(), 160);
    assert_eq!(read_u32(&scene.clips, 80 + 76), 1);
    assert_eq!(read_u32(&scene.clips, 80 + 72), 1);
    assert_eq!(
        scene
            .instances
            .chunks_exact(80)
            .map(|r| read_u32(r, 24))
            .collect::<Vec<_>>(),
        [1, 2, 1, 0]
    );

    for (tag, offset, value) in [
        (*b"CLIP", 76, 1),
        (*b"DRAW", 24, 3),
        (*b"CLIP", 68, u32::MAX),
    ] {
        let mut sections = container::decode_profile(&bytes, 2).unwrap();
        let data = &mut sections.iter_mut().find(|s| s.tag == tag).unwrap().data;
        data[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
    }
}

#[test]
fn indexes_large_connected_contours_and_rejects_invalid_bin_tables() {
    let mut content = String::new();
    for i in 0..5000 {
        let angle = (i as f64) * std::f64::consts::TAU / 5000.0;
        content.push_str(&format!(
            "{} {} {}\n",
            50.0 + 40.0 * angle.cos(),
            50.0 + 40.0 * angle.sin(),
            if i == 0 { "m" } else { "l" }
        ));
    }
    content.push_str("h f");
    let bytes = pdf::convert(&fixture(&content, "")).unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert!(read_u32(&scene.instances, 68) >= 5000);
    assert!(read_u32(&scene.instances, 28) > 0);
    assert!(scene.bins.len() > 512 * 4);
    let decoded_again = curves::decode(&curves::encode(&scene).unwrap()).unwrap();
    assert_eq!(scene.bins, decoded_again.bins);

    for (tag, offset, value) in [
        (*b"DRAW", 28, u32::MAX),
        (*b"BINS", 4, u32::MAX),
        (*b"BINS", 8, u32::MAX),
    ] {
        let mut sections = container::decode_profile(&bytes, 2).unwrap();
        let data = &mut sections.iter_mut().find(|s| s.tag == tag).unwrap().data;
        data[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
    }
}

#[test]
fn interprets_tiling_patterns_and_retains_multiply_order() {
    let content = "0.5 g 0 0 100 100 re f q /GS gs 1 0 0 rg 0 0 50 100 re f Q /Pattern cs /P scn 50 0 50 100 re f";
    let pattern = "0 1 0 rg 0 0 5 10 re f";
    let object = format!(
        "<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >> /Length {} >>\nstream\n{pattern}\nendstream",
        pattern.len()
    );
    let bytes = pdf::convert(&fixture_resources(
        content,
        "",
        "/ExtGState << /GS << /BM /Multiply /ca 0.5 >> >> /Pattern << /P 6 0 R >>",
        &[object],
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert!(scene.pages[0].count >= 52);
    assert_eq!(&scene.blends[..2], &[0, 1]);
    assert!((read_f32(&scene.instances, 80 + 44) - 0.5).abs() <= 1.0 / 255.0);
    assert!(scene.blends[2..].iter().all(|b| *b == 0));
    let mut sections = container::decode_profile(&bytes, 2).unwrap();
    sections
        .iter_mut()
        .find(|s| s.tag == *b"BLND")
        .unwrap()
        .data[0] = 2;
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn text_stroke_width_is_in_user_units_not_font_design_units() {
    let content =
        "2 w BT /F1 10 Tf 10 10 Td (I) Tj 1 Tr (I) Tj 0 Tr /F1 20 Tf (I) Tj 1 Tr (I) Tj ET";
    let scene = curves::decode(&pdf::convert(&fixture(content, "")).unwrap()).unwrap();
    assert_eq!(scene.pages[0].count, 4);
    for first in [0, 2] {
        let fill_width = read_f32(&scene.instances, first * 80);
        let stroke_width = read_f32(&scene.instances, (first + 1) * 80);
        assert!((stroke_width - fill_width - 0.02).abs() < 0.0001);
    }
}

fn fixture(content: &str, extra: &str) -> Vec<u8> {
    fixture_resources(content, extra, "", &[])
}

fn fixture_resources(
    content: &str,
    extra: &str,
    resources: &str,
    additional: &[String],
) -> Vec<u8> {
    let mut objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_owned(),
        format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] {extra} /Resources << /Font << /F1 5 0 R >> {resources} >> /Contents 4 0 R >>"
        ),
        format!(
            "<< /Length {} >>\nstream\n{content}\nendstream",
            content.len()
        ),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_owned(),
    ];
    objects.extend_from_slice(additional);
    let mut output = b"%PDF-1.7\n".to_vec();
    let mut offsets = vec![0];
    for (i, object) in objects.iter().enumerate() {
        offsets.push(output.len());
        output.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", i + 1).as_bytes());
    }
    let xref = output.len();
    output
        .extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len()).as_bytes());
    for offset in &offsets[1..] {
        output.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    output.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF",
            offsets.len()
        )
        .as_bytes(),
    );
    output
}
fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}
fn read_f32(bytes: &[u8], offset: usize) -> f32 {
    f32::from_bits(read_u32(bytes, offset))
}

#[test]
fn retains_multi_object_group_opacity_and_rejects_bad_group_ranges() {
    let content = "1 0 0 rg 0 0 60 60 re f 0 1 0 rg 30 0 60 60 re f";
    let form = format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /I true >> /Resources << >> /Length {} >>\nstream\n{content}\nendstream",
        content.len()
    );
    let bytes = pdf::convert(&fixture_resources(
        "/GS gs /G Do",
        "",
        "/XObject << /G 6 0 R >> /ExtGState << /GS << /ca 0.5 /BM /Multiply >> >>",
        &[form],
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(scene.groups.len(), 24);
    assert_eq!(read_u32(&scene.groups, 4), 2);
    assert_eq!(read_f32(&scene.groups, 8), 0.5);
    assert_eq!(read_u32(&scene.groups, 12), 1);
    assert_eq!(read_f32(&scene.instances, 44), 1.0);
    for (offset, value) in [(4, 3), (8, f32::NAN.to_bits()), (16, 1), (20, 1)] {
        let mut sections = container::decode_profile(&bytes, 2).unwrap();
        let groups = sections.iter_mut().find(|s| s.tag == *b"GRUP").unwrap();
        groups.data[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
    }
}

#[test]
fn preserves_hairline_center_curves_dashes_and_cap_styles() {
    let bytes = pdf::convert(&fixture(
        "0 w 10 10 m 90 10 l S 1 J [10 10] 0 d 10 20 m 90 80 l S",
        "",
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(read_u32(&scene.instances, 72), 3);
    assert!(
        scene.instances[80..]
            .chunks_exact(80)
            .all(|r| read_u32(r, 72) == 4)
    );
    let mut sections = container::decode_profile(&bytes, 2).unwrap();
    sections.retain(|s| s.tag != *b"HAIR");
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn retains_luminosity_mask_as_hidden_first_group_child() {
    let content = "0.5 g 0 0 100 100 re f";
    let mask = format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >> /Resources << >> /Length {} >>\nstream\n{content}\nendstream",
        content.len()
    );
    let bytes = pdf::convert(&fixture_resources(
        "/GS gs 1 0 0 rg 10 10 80 80 re f",
        "",
        "/ExtGState << /GS << /SMask << /S /Luminosity /G 6 0 R >> >> >>",
        &[mask],
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(read_u32(&scene.groups, 24 + 12), 3);
    assert_eq!(read_u32(&scene.groups, 24 + 16), 1);
    let mut sections = container::decode_profile(&bytes, 2).unwrap();
    sections.retain(|section| section.tag != *b"MASK");
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn imports_type_three_glyph_programs_and_axial_color_ramps() {
    let glyph = "500 0 0 0 500 500 d1 0 0 500 500 re f";
    let font = "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 500 500] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /A 7 0 R >> /Encoding << /Type /Encoding /Differences [65 /A] >> /FirstChar 65 /LastChar 65 /Widths [500] /Resources << >> >>".to_owned();
    let glyph = format!("<< /Length {} >>\nstream\n{glyph}\nendstream", glyph.len());
    let bytes = pdf::convert(&fixture_resources(
        "BT /T 20 Tf 10 10 Td (A) Tj ET",
        "",
        "/Font << /T 6 0 R >>",
        &[font, glyph],
    ))
    .unwrap();
    assert!(!curves::decode(&bytes).unwrap().curves.is_empty());
    let bytes = pdf::convert(&fixture_resources("/S sh", "",
        "/Shading << /S << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 100 0] /Extend [true true] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >> >>", &[])).unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(scene.images.table.len(), 24);
    assert_eq!(scene.images.pixels.len(), 4096 * 4);
    assert!(scene.images.pixels[0] > 250);
    assert!(scene.images.pixels[4096 * 4 - 2] > 250);
}

#[test]
fn retains_mask_transfer_samples_and_rejects_invalid_values() {
    let content = "1 g 0 0 100 100 re f";
    let mask = format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >> /Length {} >>\nstream\n{content}\nendstream",
        content.len()
    );
    let encoded = pdf::convert(&fixture_resources(
        "/GS gs 0 0 100 100 re f", "",
        "/ExtGState << /GS << /SMask << /S /Alpha /G 6 0 R /TR << /FunctionType 2 /Domain [0 1] /C0 [0.2] /C1 [0.8] /N 2 >> >> >> >>", &[mask],
    )).unwrap();
    let scene = curves::decode(&encoded).unwrap();
    assert_eq!(scene.mask_transfers.len(), 1028);
    assert!((read_f32(&scene.mask_transfers, 4) - 0.2).abs() < 0.00001);
    assert!((read_f32(&scene.mask_transfers, 4 + 255 * 4) - 0.8).abs() < 0.00001);
    let mut sections = container::decode_profile(&encoded, 2).unwrap();
    let table = sections.iter_mut().find(|s| s.tag == *b"MTRF").unwrap();
    table.data[4..8].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn retains_nonisolated_knockout_group_flags_and_requires_the_extension() {
    let content = "0 0 100 100 re f";
    let form = format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /I false /K true >> /Length {} >>\nstream\n{content}\nendstream",
        content.len()
    );
    let encoded = pdf::convert(&fixture_resources(
        "/G Do",
        "",
        "/XObject << /G 6 0 R >>",
        &[form],
    ))
    .unwrap();
    assert_eq!(read_u32(&curves::decode(&encoded).unwrap().groups, 12), 768);
    let mut sections = container::decode_profile(&encoded, 2).unwrap();
    sections.retain(|s| s.tag != *b"GFLG");
    assert!(curves::decode(&container::encode_profile(&sections, 2).unwrap()).is_err());
}

#[test]
fn retains_radial_circle_geometry_and_validates_it_before_gpu_upload() {
    let shading = "<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [50 50 0 50 50 40] /Extend [true true] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >>";
    let encoded = pdf::convert(&fixture_resources(
        "/S sh",
        "",
        &format!("/Shading << /S {shading} >>"),
        &[],
    ))
    .unwrap();
    let scene = curves::decode(&encoded).unwrap();
    assert_eq!(scene.radial_gradients.len(), 64);
    assert_eq!(read_f32(&scene.radial_gradients, 40), 7.0);
    let mut sections = container::decode_profile(&encoded, 3).unwrap();
    let table = sections.iter_mut().find(|s| s.tag == *b"RGRD").unwrap();
    table.data[24..28].copy_from_slice(&(-1.0_f32).to_le_bytes());
    assert!(curves::decode(&container::encode_profile(&sections, 3).unwrap()).is_err());
}

#[test]
fn converts_all_four_mesh_shading_types_without_rasterizing_text() {
    // Straight Coons/tensor boundaries make the expected extents independent of tessellation.
    let boundary = [
        (0, 0),
        (0, 85),
        (0, 170),
        (0, 255),
        (85, 255),
        (170, 255),
        (255, 255),
        (255, 170),
        (255, 85),
        (255, 0),
        (170, 0),
        (85, 0),
    ];
    for kind in 4..=7 {
        let mut data = Vec::new();
        let extra = match kind {
            4 => {
                data.extend([
                    0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255,
                ]);
                "/BitsPerFlag 8"
            }
            5 => {
                data.extend([
                    0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
                ]);
                "/VerticesPerRow 2"
            }
            _ => {
                data.push(0);
                for (x, y) in boundary {
                    data.extend([x, y]);
                }
                if kind == 7 {
                    data.extend([85, 85, 85, 170, 170, 170, 170, 85]);
                }
                data.extend([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
                "/BitsPerFlag 8"
            }
        };
        let hex = data.iter().map(|v| format!("{v:02X}")).collect::<String>() + ">";
        let shading = format!(
            "<< /ShadingType {kind} /ColorSpace /DeviceRGB /BitsPerCoordinate 8 /BitsPerComponent 8 {extra} /Decode [10 90 10 90 0 1 0 1 0 1] /Filter /ASCIIHexDecode /Length {} >>\nstream\n{hex}\nendstream",
            hex.len()
        );
        let encoded = pdf::convert(&fixture_resources(
            "/S sh BT /F1 12 Tf 20 50 Td (Vector text) Tj ET",
            "",
            "/Shading << /S 6 0 R >>",
            &[shading],
        ))
        .unwrap();
        let scene = curves::decode(&encoded).unwrap();
        assert_eq!(scene.images.table.len(), 24, "type {kind}");
        assert!(
            !scene.curves.is_empty(),
            "text must remain vector for type {kind}"
        );
        assert_eq!(
            read_u32(&scene.images.table, 20),
            4,
            "mesh has tiled LOD for type {kind}"
        );
    }
}

#[test]
fn direct_import_matches_the_validated_gdoc_round_trip() {
    let bytes = fixture(
        "0 0 1 rg 10 10 m 20 90 80 90 90 10 c h f q 20 20 60 60 re W n 0 0 100 100 re f Q BT /F1 12 Tf 10 50 Td (ABBA) Tj ET",
        "",
    );
    let encoded = pdf::convert(&bytes).unwrap();
    let decoded = curves::decode(&encoded).unwrap();
    let direct = pdf::import_owned(bytes).unwrap();
    assert_eq!(format!("{direct:?}"), format!("{decoded:?}"));
}

#[test]
fn direct_preparation_keeps_instance_validation() {
    let mut scene = pdf::import_owned(fixture("0 0 10 10 re f", "")).unwrap();
    scene.instances[32..36].copy_from_slice(&2.0_f32.to_le_bytes());
    assert!(curves::prepare_owned(scene).is_err());
}

#[test]
fn nested_empty_pattern_cells_hit_the_page_work_budget_immediately() {
    // ~10,000 outer cells each repeat an inner fill of ~10,000 empty cells: 1e8 cells that
    // never produce a draw. The budget rejects the first inner fill instead of running them.
    let stream = |content: &str, bbox: &str, step: &str, resources: &str| {
        format!(
            "<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [{bbox}] /XStep {step} /YStep {step} /Resources << {resources} >> /Length {} >>\nstream\n{content}\nendstream",
            content.len()
        )
    };
    let outer = stream(
        "/Pattern cs /P2 scn 0 0 1 1 re f",
        "0 0 1 1",
        "1",
        "/Pattern << /P2 7 0 R >>",
    );
    let inner = stream("0 0 0 0 re f", "0 0 0.01 0.01", "0.01", "");
    let started = std::time::Instant::now();
    let error = pdf::convert(&fixture_resources(
        "/Pattern cs /P1 scn 0 0 100 100 re f",
        "",
        "/Pattern << /P1 6 0 R >>",
        &[outer, inner],
    ))
    .unwrap_err();
    assert_eq!(
        error,
        gpu_document::error::DocumentError::PdfLimit {
            page: 1,
            reason: "pattern cells"
        }
    );
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
}

#[test]
fn short_axial_axes_keep_full_ramp_resolution_and_solid_extensions() {
    // A 1 pt axis inside a 100 pt clip: the ramp spans only t ∈ [0, 1].
    let bytes = pdf::convert(&fixture_resources("/S sh", "",
        "/Shading << /S << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [50 0 51 0] /Extend [true true] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >> >>", &[])).unwrap();
    let scene = curves::decode(&bytes).unwrap();
    assert_eq!(scene.images.table.len(), 3 * 24);
    assert_eq!(scene.pages[0].count, 3);
    let ramp = (0..3)
        .find(|i| read_u32(&scene.images.table, i * 24) == 4096)
        .unwrap();
    let offset = read_u32(&scene.images.table, ramp * 24 + 8) as usize;
    let pixels = &scene.images.pixels[offset..offset + 4096 * 4];
    assert!(pixels[0] > 250 && pixels[2] < 5);
    assert!(pixels[4095 * 4] < 5 && pixels[4095 * 4 + 2] > 250);
    let distinct: std::collections::HashSet<_> = pixels.chunks_exact(4).collect();
    assert!(distinct.len() > 200, "ramp has {} colors", distinct.len());
    // Extensions are opaque 1×1 end colors on either side of the ramp quad.
    let solids: Vec<&[u8]> = (0..3)
        .filter(|i| *i != ramp)
        .map(|i| {
            let at = read_u32(&scene.images.table, i * 24 + 8) as usize;
            &scene.images.pixels[at..at + 4]
        })
        .collect();
    assert!(solids.contains(&&[255, 0, 0, 255][..]) && solids.contains(&&[0, 0, 255, 255][..]));
    // The ramp quad is exactly one axis length (1 pt of a 100 pt page) wide.
    let quad = (0..3)
        .map(|i| &scene.instances[i * 80..i * 80 + 80])
        .find(|d| read_u32(d, 64) as usize == ramp)
        .unwrap();
    assert!((read_f32(quad, 0) - 0.01).abs() < 1e-6);
}

#[test]
fn soft_masked_gradient_text_shares_one_mask_group_and_one_ramp() {
    let glyphs = "I".repeat(40);
    let mask = "0.5 g 0 0 100 100 re f";
    let mask = format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >> /Resources << >> /Length {} >>\nstream\n{mask}\nendstream",
        mask.len()
    );
    let pattern = "<< /Type /Pattern /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 100 0] /Extend [true true] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >> >>".to_owned();
    let bytes = pdf::convert(&fixture_resources(
        &format!("/GS gs /Pattern cs /P scn BT /F1 4 Tf 2 50 Td ({glyphs}) Tj ET"),
        "",
        "/ExtGState << /GS << /SMask << /S /Luminosity /G 6 0 R >> >> >> /Pattern << /P 7 0 R >>",
        &[mask, pattern],
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    // One paint group, its mask child and the mask form's own group, instead of three per glyph.
    assert_eq!(scene.groups.len(), 3 * 24);
    assert_eq!(read_u32(&scene.groups, 24 + 12), 3);
    // All glyphs draw the same deduplicated ramp.
    assert_eq!(scene.images.table.len(), 24);
    let draws = scene
        .instances
        .chunks_exact(80)
        .filter(|d| read_u32(d, 72) == 2)
        .count();
    assert_eq!(draws, 40);
    assert_eq!(
        read_u32(&scene.groups, 4) as usize,
        scene.instances.len() / 80
    );
}

#[test]
fn luminosity_and_alpha_masks_over_one_group_never_share_a_mask_run() {
    let mask = "0.5 g 0 0 100 100 re f";
    let mask = format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /CS /DeviceRGB >> /Resources << >> /Length {} >>\nstream\n{mask}\nendstream",
        mask.len()
    );
    let bytes = pdf::convert(&fixture_resources(
        "q /Lum gs 1 0 0 rg 10 10 30 30 re f Q q /Alpha gs 0 1 0 rg 60 10 30 30 re f Q",
        "",
        "/ExtGState << /Lum << /SMask << /S /Luminosity /G 6 0 R >> >> /Alpha << /SMask << /S /Alpha /G 6 0 R >> >> >>",
        &[mask],
    ))
    .unwrap();
    let scene = curves::decode(&bytes).unwrap();
    let mut kinds: Vec<u32> = scene
        .groups
        .chunks_exact(24)
        .map(|group| read_u32(group, 12))
        .filter(|kind| matches!(kind, 2 | 3))
        .collect();
    kinds.sort_unstable();
    // Both draws keep their own mask even though the masks share a form and bounds do not overlap.
    assert_eq!(kinds, [2, 3]);
}

#[test]
fn transparency_group_limit_is_enforced_while_interpreting_with_its_page() {
    let form = "<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Group << /S /Transparency >> /Length 0 >>\nstream\n\nendstream".to_owned();
    let content = "/G Do ".repeat(100_001);
    let started = std::time::Instant::now();
    let error = pdf::convert(&fixture_resources(
        &content,
        "",
        "/XObject << /G 6 0 R >>",
        &[form],
    ))
    .unwrap_err();
    assert_eq!(
        error,
        gpu_document::error::DocumentError::PdfLimit {
            page: 1,
            reason: "transparency group records"
        }
    );
    assert!(started.elapsed() < std::time::Duration::from_secs(10));
}
