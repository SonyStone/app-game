# PDF JPEG 2000 fixture

`rgb-320x240.jp2` is an original synthetic image with no material from the external PDF corpus:
red ramps left to right, green top to bottom, and blue is a sine pattern. Generated as an RGB PNG
and converted with macOS `sips -s format jp2 -s formatOptions 60`. Its RGBA size (300 KiB) is
above the raw-RGBA threshold, so the importer re-encodes it as a baseline JPEG resource.
