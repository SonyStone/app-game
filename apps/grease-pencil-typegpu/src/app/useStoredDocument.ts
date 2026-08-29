import { createSignal, createTrackedEffect } from 'solid-js';
import {
  createInitialDocument,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  type GreaseDocument
} from '../document';

export function useStoredDocument() {
  const [documentState, setDocumentState] = createSignal<GreaseDocument>(
    loadDocumentFromStorage() ?? createInitialDocument()
  );

  createTrackedEffect(() => {
    saveDocumentToStorage(documentState());
  });

  return {
    documentState,
    setDocumentState
  } as const;
}
