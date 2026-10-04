/**
 * PackBits, the run-length compression of PSD channel rows: literal runs of up to 128 bytes are stored after a header
 * of their length minus one, repeats of 2 to 128 bytes as 1 minus their length and the byte.
 */
export function packBits(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < row.length) {
    let run = 1;
    while (run < 128 && index + run < row.length && row[index + run] === row[index]) {
      run++;
    }

    if (run >= 2) {
      out.push(257 - run, row[index]!);
      index += run;
      continue;
    }

    // A literal run ends where a repeat of at least two bytes starts.
    const start = index;
    while (index < row.length && index - start < 128 && !(index + 1 < row.length && row[index] === row[index + 1])) {
      index++;
    }

    if (index === start) {
      index++;
    }

    out.push(index - start - 1);
    for (let at = start; at < index; at++) {
      out.push(row[at]!);
    }
  }

  return Uint8Array.from(out);
}

/** Expands PackBits `data` into `length` bytes; throws when the data is short or corrupt. */
export function unpackBits(data: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let read = 0,
    written = 0;
  while (written < length) {
    if (read >= data.length) {
      throw new Error('A compressed PSD row ends early.');
    }

    const header = (data[read++]! << 24) >> 24;
    if (header >= 0) {
      const count = header + 1;
      if (read + count > data.length || written + count > length) {
        throw new Error('A compressed PSD row is corrupt.');
      }

      out.set(data.subarray(read, read + count), written);
      read += count;
      written += count;
    } else if (header !== -128) {
      const count = 1 - header;
      if (written + count > length) {
        throw new Error('A compressed PSD row is corrupt.');
      }

      out.fill(data[read++]!, written, written + count);
      written += count;
    }
  }

  return out;
}
