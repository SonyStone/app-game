/** Measured progress for the current stage; missing totals mean indeterminate work. */
export type DocumentProgress = {
  stage:
    | 'readingFile'
    | 'loadingDecoder'
    | 'loadingDocument'
    | 'processingPages'
    | 'decodingDocument'
    | 'preparingGraphics';
  completed?: number;
  total?: number;
};

/** Receives progress synchronously while a document session remains active. */
export type OnDocumentProgress = (progress: DocumentProgress) => void;
