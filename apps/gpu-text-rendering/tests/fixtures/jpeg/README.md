# PDF CMYK JPEG fixtures

These original synthetic fixtures contain no material from the external PDF corpus.
Each image is 64×16 pixels, with four 16-pixel-wide constant CMYK patches:

| Patch | C | M | Y | K |
| --- | --- | --- | --- | --- |
| White | 0 | 0 | 0 | 0 |
| Black | 0 | 0 | 0 | 255 |
| Cyan | 255 | 0 | 0 | 0 |
| Magenta | 0 | 255 | 0 | 0 |

Encoded with libjpeg-turbo: `input_components = 4`, `in_color_space = JCS_CMYK`,
quality 100, and horizontal/vertical sampling factors 1 for every component.
`pdf-cmyk.jpg` uses output color space `JCS_CMYK`; `pdf-ycck.jpg` uses `JCS_YCCK`.
Neither fixture embeds an ICC profile. The PDF converter attaches its DeviceCMYK profile.

The component values deliberately follow PDF's default Decode range. Opening these
as standalone JPEG files can produce inverted colors. Rust tests check decoding;
the browser test embeds each JPEG in a DeviceCMYK PDF, retains it through GDOC,
and checks the rendered GPU colors.
