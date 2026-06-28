import type { GreaseDocument } from './model'
import { DOCUMENT_STORAGE_KEY } from './model'
import { normalizeStoredDocument } from './storageNormalize'
import { isStoredGreaseDocument } from './storageValidation'

export function loadDocumentFromStorage(): GreaseDocument | undefined {
  try {
    const serialized = localStorage.getItem(DOCUMENT_STORAGE_KEY)
    if (!serialized) return undefined

    const parsed: unknown = JSON.parse(serialized)
    if (!isStoredGreaseDocument(parsed)) return undefined

    return normalizeStoredDocument(parsed)
  }
  catch {
    return undefined
  }
}

export function saveDocumentToStorage(document: GreaseDocument) {
  try {
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document))
  }
  catch {
    // Storage is a convenience; drawing should keep working if it is blocked.
  }
}
