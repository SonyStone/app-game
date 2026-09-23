//! Stable failure categories shared by native and WebAssembly callers.

/// Invalid input never requires a panic or message parsing by callers.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DocumentError {
    /// File framing, offsets, reserved fields or record contents are invalid.
    #[error("Invalid document: {0}")]
    Invalid(&'static str),
    /// Version, required block, profile or compression is not understood.
    #[error("Unsupported document: {0}")]
    Unsupported(&'static str),
    /// A file exceeds the decoder's explicit resource budgets.
    #[error("Document exceeds the {0} limit")]
    Limit(&'static str),
    /// Resource limit with the originating PDF page retained.
    #[error("PDF page {page} exceeds the {reason} limit")]
    PdfLimit {
        /// One-based page number.
        page: usize,
        /// Budget being enforced.
        reason: &'static str,
    },
    /// Compressed data is malformed or has the wrong decoded length.
    #[error("Invalid compressed document block")]
    Compression,
    /// CRC-32 does not match the directory or an uncompressed block.
    #[error("Document checksum mismatch")]
    Checksum,
    /// The PDF importer cannot faithfully represent an operation on this page.
    #[error("Unsupported PDF on page {page}: {reason}")]
    PdfUnsupported {
        /// One-based page number.
        page: usize,
        /// Drawing feature or interpretation warning.
        reason: String,
    },
}

impl DocumentError {
    /// Stable machine-readable category, also exposed by the WASM result.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Invalid(_) => "invalid-data",
            Self::Unsupported(_) => "unsupported-format",
            Self::Limit(_) | Self::PdfLimit { .. } => "document-limit",
            Self::Compression => "decode",
            Self::Checksum => "checksum",
            Self::PdfUnsupported { .. } => "unsupported-pdf",
        }
    }
}
