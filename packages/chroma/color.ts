const { last, clip_rgb, type } = require('./utils');
const _input = require('./io/input');

export class Color {
  constructor(...args) {
    if (type(args[0]) === 'object' && args[0].constructor && args[0].constructor === this.constructor) {
      // the argument is already a Color instance
      return args[0];
    }

    // last argument could be the mode
    let mode = last(args);
    let autodetect = false;

    if (!mode) {
      autodetect = true;
      if (!_input.sorted) {
        _input.autodetect = _input.autodetect.sort((a, b) => b.p - a.p);
        _input.sorted = true;
      }
      // auto-detect format
      for (let chk of _input.autodetect) {
        mode = chk.test(...args);
        if (mode) break;
      }
    }

    if (_input.format[mode]) {
      const rgb = _input.format[mode].apply(null, autodetect ? args : args.slice(0, -1));
      this._rgb = clip_rgb(rgb);
    } else {
      throw new Error('unknown format: ' + args);
    }

    // add alpha channel
    if (this._rgb.length === 3) {
      this._rgb.push(1);
    }
  }

  toString() {
    if (type(this.hex) == 'function') return this.hex();
    return `[${this._rgb.join(',')}]`;
  }
}
