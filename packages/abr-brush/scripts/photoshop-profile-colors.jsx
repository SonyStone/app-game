/** Measures saved Gray/CMYK color interpretation in an isolated sRGB/8 document.
 * Reads working profiles without changing them; restores the user's document and dialog mode.
 */
(function () {
  var original = app.documents.length ? app.activeDocument : null;
  var dialogs = app.displayDialogs,
    doc = null;
  var s = stringIDToTypeID;
  function json(descriptor) {
    var wrapper = new ActionDescriptor();
    wrapper.putObject(s('object'), s('object'), descriptor);
    return executeAction(s('convertJSONdescriptor'), wrapper, DialogModes.NO).getString(s('json'));
  }
  try {
    var reference = new ActionReference();
    reference.putProperty(s('property'), s('colorSettings'));
    reference.putEnumerated(s('application'), s('ordinal'), s('targetEnum'));
    var configuration = json(executeActionGet(reference));
    app.displayDialogs = DialogModes.NO;
    doc = app.documents.add(
      UnitValue(32, 'px'),
      UnitValue(32, 'px'),
      72,
      'Gray CMYK color probe',
      NewDocumentMode.RGB,
      DocumentFill.WHITE,
      1,
      BitsPerChannelType.EIGHT,
      'sRGB IEC61966-2.1'
    );
    var rows = [];
    function sample(model, channels, color) {
      doc.selection.selectAll();
      doc.selection.fill(color, ColorBlendMode.NORMAL, 100, false);
      doc.selection.deselect();
      var sampler = doc.colorSamplers.add([UnitValue(16, 'px'), UnitValue(16, 'px')]);
      var rgb = sampler.color.rgb,
        solid = color.rgb;
      rows.push(
        '{"model":"' +
          model +
          '","channels":[' +
          channels.join(',') +
          '],"solid":[' +
          [solid.red, solid.green, solid.blue].join(',') +
          '],"pixel":[' +
          [rgb.red, rgb.green, rgb.blue].join(',') +
          ']}'
      );
      sampler.remove();
    }
    for (var gray = 0; gray <= 100; gray++) {
      var color = new SolidColor();
      color.gray.gray = gray;
      sample('Gray', [gray], color);
    }
    var cmyk = [
      [0, 0, 0, 0],
      [100, 0, 0, 0],
      [0, 100, 0, 0],
      [0, 0, 100, 0],
      [0, 0, 0, 100],
      [100, 100, 100, 100],
      [50, 0, 0, 0],
      [0, 50, 0, 0],
      [0, 0, 50, 0],
      [0, 0, 0, 50],
      [20, 30, 40, 10],
      [0, 100, 100, 0],
      [100, 0, 100, 0],
      [100, 100, 0, 0],
      [10, 10, 10, 10]
    ];
    for (var i = 0; i < cmyk.length; i++) {
      var color = new SolidColor(),
        value = cmyk[i];
      color.cmyk.cyan = value[0];
      color.cmyk.magenta = value[1];
      color.cmyk.yellow = value[2];
      color.cmyk.black = value[3];
      sample('CMYK', value, color);
    }
    var file = new File(Folder.temp + '/paint-native-profile-colors.json');
    file.encoding = 'UTF8';
    if (!file.open('w')) throw new Error('Cannot write Gray/CMYK color measurements');
    file.write(
      '{"photoshop":"' +
        app.version +
        '","destination":"' +
        doc.colorProfileName +
        '","configuration":' +
        configuration +
        ',"cases":[' +
        rows.join(',') +
        ']}'
    );
    file.close();
    return file.fsName;
  } finally {
    if (doc) doc.close(SaveOptions.DONOTSAVECHANGES);
    if (original) app.activeDocument = original;
    app.displayDialogs = dialogs;
  }
})();
