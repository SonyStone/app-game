import { _bam_first_minor_ver, _bam_header, _bam_last_minor_ver, _bam_major_ver, _bam_minor_ver } from './bam';
import { BinaryReader } from './binary-reader';

const enum BamObjectCode {
  // Indicates an object definition, and will always be eventually paired
  // with a BOC_pop (which does not).
  BOC_push,
  BOC_pop,

  // Includes an object definition but does not push the level; it is
  // associated with the current level.
  BOC_adjunct,

  // Lists object IDs that have been deallocated on the sender end.
  BOC_remove,

  // May appear at any level and indicates the following datagram contains
  // auxiliary file data that may be referenced by a later object.
  BOC_file_data
}

export class BamReader {
  scan: BinaryReader;

  _file_major: number;
  _file_minor: number;
  _file_stdfloat_double: boolean = false;
  _file_endian: number;

  // _needs_init = true;
  _num_extra_objects = 0;
  _nesting_level = 0;
  // _now_creating = _created_objs.end();
  _reading_cycler = null;
  _pta_id = -1;
  _long_object_id = false;
  _long_pta_id = false;

  constructor(buffer: ArrayBuffer) {
    this.scan = new BinaryReader(buffer, true);

    const header = this.scan.getString(6); // read bam name
    console.log(header, _bam_header === header);

    // need to skip some data
    const num_bytes_32 = this.scan.getUint32();

    if (num_bytes_32 === -1) {
      console.error('Handle 64-Bit Datagram Size');
    }

    console.log(`num_bytes_32`, num_bytes_32);

    this._file_major = this.scan.getUint16();
    this._file_minor = this.scan.getUint16();
    console.log(`file version: ${this._file_major}.${this._file_minor}`);

    if (
      this._file_major !== _bam_major_ver ||
      this._file_minor < _bam_first_minor_ver ||
      this._file_minor > _bam_last_minor_ver
    ) {
      console.error(`Bam file is version ${this._file_major}.${this._file_minor}.\n`);

      // @ts-ignore
      if (_bam_minor_ver === _bam_first_minor_ver) {
        console.error(`This program can only load version ${_bam_major_ver}.${_bam_first_minor_ver} bams.\n`);
      } else {
        console.error(
          `This program can only load version ${_bam_major_ver}.${_bam_first_minor_ver} through ${_bam_major_ver}.${_bam_last_minor_ver} bams.\n`
        );
      }
    }

    this._file_endian = this.scan.getUint8();
    console.log(`_file_endian`, this._file_endian);

    this._file_stdfloat_double = false;
    if (this._file_minor >= 27) {
      this._file_stdfloat_double = this.scan.getBoolean();
    }

    if (this.scan.getOffset() > this.scan.size()) {
      console.error(`Bam header is too short.\n`);
    }

    console.log(`_file_stdfloat_double`, this._file_stdfloat_double);
  }

  read_object() {
    if (this._file_minor >= 21) {
      const boc = this.scan.getUint8();

      console.log(`boc`, boc);
    }
  }
}
