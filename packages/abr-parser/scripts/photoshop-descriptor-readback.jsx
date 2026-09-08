/**
 * Photoshop ExtendScript: read ABR desc payloads with native typed getters.
 * Set global ABR_AUDIT_DIRECTORY to a local directory containing manifest.json:
 * { tokens: string[], records: [{ input: absoluteBinaryPath, output: absoluteJsonPath }] }.
 * Inputs include the four-byte descriptor version. Writes one JSON per record and
 * native-report.json; does not load presets, change tools, or modify documents.
 * This oracle covers only the nine wire types present in the audited corpus.
 */
(function () {
  if (typeof ABR_AUDIT_DIRECTORY !== 'string') throw new Error('Set ABR_AUDIT_DIRECTORY before running this script.');
  var directory = ABR_AUDIT_DIRECTORY;
  var m = eval('(' + read(directory + '/manifest.json', false) + ')'),
    report = { version: app.version, records: [], ids: {} };
  for (var j = 0; j < m.tokens.length; j++) {
    var token = m.tokens[j];
    report.ids[token] = id(token.length === 4 ? charIDToTypeID(token) : stringIDToTypeID(token));
  }
  for (var i = 0; i < m.records.length; i++) {
    var r = m.records[i];
    try {
      var d = new ActionDescriptor();
      d.fromStream(read(r.input, true));
      write(r.output, descriptor(d));
      report.records.push({ input: r.input, ok: true });
    } catch (e) {
      report.records.push({ input: r.input, ok: false, error: String(e) });
    }
  }
  write(directory + '/native-report.json', report);
  return 'Read ' + report.records.length + ' descriptor blocks without changing application state.';

  function read(path, binary) {
    var f = new File(path);
    f.encoding = binary ? 'BINARY' : 'UTF8';
    if (!f.open('r')) throw Error('Cannot open ' + path);
    var x = f.read();
    f.close();
    return x;
  }
  function write(path, value) {
    var f = new File(path);
    f.encoding = 'UTF8';
    if (!f.open('w')) throw Error('Cannot write ' + path);
    f.write(json(value));
    f.close();
  }
  function json(x) {
    if (x === null) return 'null';
    if (typeof x === 'string')
      return (
        '"' +
        x.replace(/[\\"\u0000-\u001f]/g, function (c) {
          if (c === '\\') return '\\\\';
          if (c === '"') return '\\"';
          return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) +
        '"'
      );
    if (typeof x === 'number') return x.toPrecision(17);
    if (typeof x === 'boolean') return String(x);
    var a = [],
      i;
    if (x instanceof Array) {
      for (i = 0; i < x.length; i++) a.push(json(x[i]));
      return '[' + a.join(',') + ']';
    }
    for (i in x) if (x.hasOwnProperty(i)) a.push(json(i) + ':' + json(x[i]));
    return '{' + a.join(',') + '}';
  }
  function id(k) {
    try {
      var c = typeIDToCharID(k);
      if (c && c.indexOf('\x00') < 0) return c;
    } catch (e) {}
    return typeIDToStringID(k);
  }
  /** Encode the exact significand because ExtendScript rounds decimal strings. */
  function floating(v) {
    if (!isFinite(v)) throw new Error('Non-finite number is outside this audit');
    if (v === 0) return [1 / v < 0 ? -1 : 1, 0, 0, 0];
    var sign = v < 0 ? -1 : 1;
    v = Math.abs(v);
    var e = Math.floor(Math.log(v) / Math.LN2),
      m = v / Math.pow(2, e);
    while (m < 1) {
      e--;
      m *= 2;
    }
    while (m >= 2) {
      e++;
      m /= 2;
    }
    m *= 4503599627370496;
    return [sign, e, Math.floor(m / 4294967296), m % 4294967296];
  }
  function data(s) {
    var a = [];
    for (var i = 0; i < s.length; i++) a.push(('0' + (s.charCodeAt(i) & 255).toString(16)).slice(-2));
    return a.join('');
  }
  function descriptor(d) {
    var o = {};
    for (var i = 0; i < d.count; i++) {
      var k = d.getKey(i);
      o[id(k)] = value(d, k);
    }
    return o;
  }
  function value(d, k) {
    var t = d.getType(k);
    if (t === DescValueType.BOOLEANTYPE) return { type: 'bool', value: d.getBoolean(k) };
    if (t === DescValueType.INTEGERTYPE) return { type: 'long', value: d.getInteger(k) };
    if (t === DescValueType.DOUBLETYPE) return { type: 'doub', value: floating(d.getDouble(k)) };
    if (t === DescValueType.STRINGTYPE) return { type: 'TEXT', value: d.getString(k) };
    if (t === DescValueType.UNITDOUBLE)
      return { type: 'UntF', unit: id(d.getUnitDoubleType(k)), value: floating(d.getUnitDoubleValue(k)) };
    if (t === DescValueType.ENUMERATEDTYPE)
      return { type: 'enum', typeId: id(d.getEnumerationType(k)), value: id(d.getEnumerationValue(k)) };
    if (t === DescValueType.OBJECTTYPE)
      return { type: 'Objc', classId: id(d.getObjectType(k)), value: descriptor(d.getObjectValue(k)) };
    if (t === DescValueType.LISTTYPE) {
      var l = d.getList(k),
        a = [];
      for (var i = 0; i < l.count; i++) a.push(value(l, i));
      return { type: 'VlLs', value: a };
    }
    if (t === DescValueType.RAWTYPE) return { type: 'tdta', value: data(d.getData(k)) };
    throw Error('Unsupported native audit type ' + t + ' at ' + id(k));
  }
})();
