/** Small, original PDF fixtures with real xref offsets, suitable for native/WASM/reference renderers. */
export function makePdf(
  content,
  { rotate = 0, width = 600, height = 600, pages = 1, resources = '', extraObjects = [] } = {}
) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${6 + i} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Unused true >>',
    ...Array.from(
      { length: pages },
      () =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotate} /Resources << /Font << /F1 3 0 R >> ${resources} >> /Contents 4 0 R >>`
    ),
    ...extraObjects
  ];
  return encodeObjects(objects);
}

/** Mixed paint-order fixture: reused RGB image, soft mask, colored stencil, clipping and reflection. */
export function makeImagePdf() {
  const content = `
    0 0 1 rg 0 0 600 600 re f
    q 400 0 0 400 100 100 cm /Im Do Q
    1 1 0 rg 200 300 100 100 re f
    q 200 0 0 100 0 0 cm /Alpha Do Q
    0 1 0 rg q 100 0 0 100 450 0 cm /Stencil Do Q
    q 500 500 50 100 re W n 100 0 0 100 500 500 cm /Im Do Q
    q -100 0 0 100 100 500 cm /Im Do Q
  `;
  return encodeObjects([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 600] /Resources << /XObject << /Im 5 0 R /Alpha 6 0 R /Stencil 8 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    imageObject(
      '/Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true',
      'FF000000FF000000FFFFFFFF'
    ),
    imageObject('/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 7 0 R', 'FF0000FF0000'),
    imageObject('/Width 2 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8', '0080'),
    imageObject('/Width 2 /Height 1 /ImageMask true /BitsPerComponent 1', '40')
  ]);
}

function imageObject(dictionary, hex) {
  return `<< /Type /XObject /Subtype /Image ${dictionary} /Filter /ASCIIHexDecode /Length ${hex.length + 1} >>\nstream\n${hex}>\nendstream`;
}

function encodeObjects(objects) {
  let output = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

export const curvePage = `
0.12 0.25 0.65 rg
BT /F1 32 Tf 40 540 Td (PDF: curves and text) Tj ET
0 0 0 rg
BT /F1 16 Tf 40 505 Td (ABBA - reusable outlines) Tj ET
0.1 0.65 0.4 rg
50 100 m 50 450 300 450 300 100 c h f
0.85 0.2 0.3 rg
350 120 200 270 re 390 160 120 190 re f*
q 60 50 180 20 re W n 0.2 0.4 0.95 rg 0 0 400 100 re f Q
`;
