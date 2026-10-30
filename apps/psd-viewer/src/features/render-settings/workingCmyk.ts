/** Local, user-owned working profile. Bytes never leave this browser's IndexedDB. */
export type WorkingCmyk = { name: string; bytes: Uint8Array };

/** Reads the user's working space in either the UI or a rendering worker. */
export async function loadWorkingCmyk(): Promise<WorkingCmyk | undefined> {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }

  return accessProfile('readonly');
}

/** Validates the ICC header before persisting. Conversion reports any unsupported profile tables. */
export async function saveWorkingCmyk(profile: WorkingCmyk | undefined): Promise<void> {
  if (profile) {
    const bytes = profile.bytes;
    const signature = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (
      bytes.length < 132 ||
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) !== bytes.length ||
      signature(36) !== 'acsp' ||
      signature(16) !== 'CMYK'
    ) {
      throw new Error('Choose a valid CMYK ICC profile.');
    }
  }

  await accessProfile('readwrite', profile);
}

/** Completes only after the transaction commits; connections are closed on every path. */
function accessProfile(mode: IDBTransactionMode, profile?: WorkingCmyk): Promise<WorkingCmyk | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('psd-viewer-display', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('profiles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('profiles', mode);
      const store = transaction.objectStore('profiles');
      const request =
        mode === 'readonly' ? store.get('cmyk') : profile ? store.put(profile, 'cmyk') : store.delete('cmyk');
      transaction.oncomplete = () => {
        database.close();
        resolve(mode === 'readonly' ? (request.result as WorkingCmyk | undefined) : profile);
      };
      transaction.onabort = transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}
