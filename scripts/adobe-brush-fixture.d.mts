/**
 * Downloads an Adobe brush pack once into the ignored `.tmp/adobe-brushes` cache and returns its bytes.
 * Rejects invalid filenames, HTTP failures and files without an ABR header.
 */
export function readAdobeBrushFixture(filename: string): Promise<Buffer>;
