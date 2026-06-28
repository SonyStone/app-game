import {
  createEffect,
  createSignal,
} from 'solid-js'
import {
  createInitialDocument,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  type GreaseDocument,
} from '../document'

export function useStoredDocument() {
  const [documentState, setDocumentState] = createSignal<GreaseDocument>(
    loadDocumentFromStorage() ?? createInitialDocument(),
  )

  createEffect(() => {
    saveDocumentToStorage(documentState())
  })

  return {
    documentState,
    setDocumentState,
  } as const
}
